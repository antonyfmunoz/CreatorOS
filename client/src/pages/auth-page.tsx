import { SignIn, SignUp } from "@clerk/clerk-react";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { useLocation } from "wouter";

const clerkAppearance = {
  elements: {
    rootBox: "!w-full !max-w-none",
    cardBox: "!w-full",
    card: "!w-full !max-w-none !rounded-xl !border !border-zinc-800 !bg-zinc-950 !shadow-none",
    headerTitle: "!text-white",
    headerSubtitle: "!text-zinc-400",
    socialButtonsBlockButton:
      "!border-zinc-700 !bg-zinc-900 !text-white hover:!bg-zinc-800",
    dividerLine: "!bg-zinc-800",
    dividerText: "!text-zinc-500",
    formFieldLabel: "!text-zinc-300",
    formFieldInput:
      "!border-zinc-700 !bg-zinc-900 !text-white placeholder:!text-zinc-500",
    formButtonPrimary: "!bg-sky-500 hover:!bg-sky-400 !text-white",
    footer: "!bg-transparent",
    footerActionText: "!text-zinc-400",
    footerActionLink: "!text-sky-400 hover:!text-sky-300",
  },
} as const;

const AuthPage = () => {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Auth form section */}
      <div className="flex w-full flex-1 items-center justify-center px-5 py-10 sm:px-8 md:w-1/2 md:px-10">
        <div className="w-full max-w-md space-y-6">
          {mode === "sign-in" ? (
            <>
              <SignIn routing="hash" appearance={clerkAppearance} />
              <div className="text-center">
                <p className="text-sm text-zinc-400">
                  Don't have an account?{" "}
                  <button
                    onClick={() => setMode("sign-up")}
                    className="text-primary hover:underline"
                  >
                    Register now
                  </button>
                </p>
              </div>
            </>
          ) : (
            <>
              <SignUp routing="hash" appearance={clerkAppearance} />
              <div className="text-center">
                <p className="text-sm text-zinc-400">
                  Already have an account?{" "}
                  <button
                    onClick={() => setMode("sign-in")}
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
