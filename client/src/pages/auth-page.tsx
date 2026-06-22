import { SignIn, SignUp } from "@clerk/clerk-react";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { useLocation } from "wouter";

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
      <div className="w-full md:w-1/2 p-8 flex flex-1 items-center justify-center">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold">Welcome to CreatorOS</h1>
            <p className="text-gray-500 mt-2">
              Your all-in-one platform for creators
            </p>
          </div>

          {mode === "sign-in" ? (
            <>
              <SignIn routing="hash" />
              <div className="text-center">
                <p className="text-sm text-gray-500">
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
              <SignUp routing="hash" />
              <div className="text-center">
                <p className="text-sm text-gray-500">
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
      <div className="w-full md:w-1/2 bg-gradient-to-br from-primary/10 to-primary/20 p-8 hidden md:flex items-center justify-center">
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
