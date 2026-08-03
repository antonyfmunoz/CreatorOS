import { SignIn, SignUp } from "@clerk/clerk-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

const clerkAppearance = {
  elements: {
    rootBox: "!w-full !max-w-none",
    cardBox: "!w-full",
    card: "!w-full !max-w-none !rounded-xl",
  },
} as const;

const AuthPage = () => {
  const [location, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const isRegistration = location === "/register";

  if (isSignedIn) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Auth form section */}
      <div className="flex w-full flex-1 items-center justify-center px-5 py-10 sm:px-8 md:w-1/2 md:px-10">
        <div className="w-full max-w-md space-y-6">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Welcome to CreativesOS</h1>
            <p className="mt-2 text-zinc-400">
              Your all-in-one platform for distribution
            </p>
          </div>

          {!isRegistration ? (
            <>
              <SignIn routing="hash" appearance={clerkAppearance} signUpUrl="/register" />
              <div className="text-center">
                <p className="text-sm text-zinc-400">
                  Don't have an account?{" "}
                  <button
                    onClick={() => setLocation("/register")}
                    className="text-primary hover:underline"
                  >
                    Register now
                  </button>
                </p>
              </div>
            </>
          ) : (
            <>
              <SignUp routing="hash" appearance={clerkAppearance} signInUrl="/auth" />
              <div className="text-center">
                <p className="text-sm text-zinc-400">
                  Already have an account?{" "}
                  <button
                    onClick={() => setLocation("/auth")}
                    className="text-primary hover:underline"
                  >
                    Login
                  </button>
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hero section */}
      <div className="hidden w-full items-center justify-center bg-gradient-to-br from-sky-500/10 to-violet-500/10 p-8 md:flex md:w-1/2">
        <div className="max-w-lg space-y-6">
          <h2 className="text-3xl font-bold">Everything Creators Need in One Place</h2>

          <div className="space-y-4">
            <div className="bg-white/80 p-4 rounded-lg shadow-sm">
              <h3 className="font-semibold text-lg mb-2">Share & Engage</h3>
              <p className="text-sm text-gray-600">
                Post stories, share content, and build an engaged community all in one platform
              </p>
            </div>

            <div className="bg-white/80 p-4 rounded-lg shadow-sm">
              <h3 className="font-semibold text-lg mb-2">Monetize Your Content</h3>
              <p className="text-sm text-gray-600">
                Sell digital products, courses, and services directly to your audience
              </p>
            </div>

            <div className="bg-white/80 p-4 rounded-lg shadow-sm">
              <h3 className="font-semibold text-lg mb-2">AI-Powered Tools</h3>
              <p className="text-sm text-gray-600">
                Leverage AI to create content, analyze audience data, and grow your business
              </p>
            </div>

            <div className="bg-white/80 p-4 rounded-lg shadow-sm">
              <h3 className="font-semibold text-lg mb-2">Community Building</h3>
              <p className="text-sm text-gray-600">
                Create dedicated spaces for your community to interact and collaborate
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
