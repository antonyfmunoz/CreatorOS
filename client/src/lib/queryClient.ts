import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    try {
      // Try to parse the response as JSON first
      const errorData = await res.json();
      throw new Error(errorData.message || `${res.status}: ${res.statusText}`);
    } catch (e) {
      // If JSON parsing fails, fall back to text
      try {
        const text = await res.text();
        throw new Error(text || `${res.status}: ${res.statusText}`);
      } catch (e2) {
        // If all else fails, use the status
        throw new Error(`${res.status}: ${res.statusText}`);
      }
    }
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // Use a shorter staleTime to allow refetching when needed
      staleTime: 1000 * 60 * 5, // 5 minutes
      // Add a structural sharing function to ensure stable refs
      structuralSharing: (oldData, newData) => {
        // If both are arrays and we're dealing with posts
        if (Array.isArray(oldData) && Array.isArray(newData) && 
            oldData.length > 0 && newData.length > 0 && 
            'id' in oldData[0] && 'id' in newData[0]) {
          // Create a map of old items by ID for quick lookup
          const oldMap = new Map(oldData.map(item => [item.id, item]));
          // For each new item, preserve reference to old item if unchanged
          return newData.map(newItem => {
            const oldItem = oldMap.get(newItem.id);
            if (oldItem && JSON.stringify(oldItem) === JSON.stringify(newItem)) {
              return oldItem; // Preserve reference if identical
            }
            return newItem; // Otherwise use the new item
          }).sort((a, b) => b.id - a.id); // Maintain consistent sort by ID
        }
        return newData; // Default to new data for non-post queries
      },
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
