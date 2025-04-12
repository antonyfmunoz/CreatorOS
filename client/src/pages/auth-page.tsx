import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/lib/stores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { User } from "@/types";

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [, navigate] = useLocation();
  const { isAuthenticated, login, register, isLoading } = useAuthStore();
  const { toast } = useToast();

  // Login form state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [registerDisplayName, setRegisterDisplayName] = useState("");
  const [registerBio, setRegisterBio] = useState("");

  // If user is already authenticated, redirect to homepage
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!loginUsername || !loginPassword) {
      toast({
        title: "Error",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }
    
    try {
      await login(loginUsername, loginPassword);
      toast({
        title: "Success",
        description: "You have been logged in successfully",
      });
      navigate("/");
    } catch (error) {
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!registerUsername || !registerPassword || !registerDisplayName) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    if (registerPassword !== registerConfirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }
    
    try {
      // Create a user object with the form data
      const userData = {
        username: registerUsername,
        password: registerPassword,
        displayName: registerDisplayName,
        bio: registerBio || undefined,
        profileImageUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${registerUsername}`, // Generate avatar based on username
        role: "creator"
      };
      
      // Call register function from auth store
      await register(userData);
      
      toast({
        title: "Success",
        description: "Your account has been created successfully",
      });
      
      navigate("/");
    } catch (error) {
      toast({
        title: "Registration failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Hero Section - Left on mobile, right on desktop */}
      <div className="flex-1 bg-primary p-6 flex flex-col justify-center md:order-2">
        <div className="max-w-md mx-auto text-white">
          <h1 className="text-4xl font-bold mb-6">CreatorOS</h1>
          <h2 className="text-2xl font-semibold mb-4">The Ultimate Platform for Creators</h2>
          <p className="text-lg mb-8">
            Join our growing community of creators, share content, build your audience, 
            and monetize your skills all in one place.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-white/10 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Content Sharing</h3>
              <p className="text-sm">Share posts, stories, and engage with your audience</p>
            </div>
            <div className="bg-white/10 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Marketplace</h3>
              <p className="text-sm">Sell products and services directly to your followers</p>
            </div>
            <div className="bg-white/10 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">AI Assistance</h3>
              <p className="text-sm">Leverage AI tools to enhance your content creation</p>
            </div>
            <div className="bg-white/10 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Community</h3>
              <p className="text-sm">Build and manage your own dedicated communities</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Auth Form - Right on mobile, left on desktop */}
      <div className="flex-1 p-6 flex items-center justify-center md:order-1">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome to CreatorOS</CardTitle>
            <CardDescription>
              Sign in to your account or create a new one to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" value={activeTab} onValueChange={(value) => setActiveTab(value as "login" | "register")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input 
                      id="username" 
                      type="text" 
                      placeholder="Your username"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input 
                      id="password" 
                      type="password" 
                      placeholder="Your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-username">Username</Label>
                    <Input 
                      id="register-username" 
                      type="text" 
                      placeholder="Choose a username"
                      value={registerUsername}
                      onChange={(e) => setRegisterUsername(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="display-name">Display Name</Label>
                    <Input 
                      id="display-name" 
                      type="text" 
                      placeholder="Your full name"
                      value={registerDisplayName}
                      onChange={(e) => setRegisterDisplayName(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio (Optional)</Label>
                    <Input 
                      id="bio" 
                      type="text" 
                      placeholder="Tell us about yourself"
                      value={registerBio}
                      onChange={(e) => setRegisterBio(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input 
                      id="register-password" 
                      type="password" 
                      placeholder="Choose a password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input 
                      id="confirm-password" 
                      type="password" 
                      placeholder="Confirm your password"
                      value={registerConfirmPassword}
                      onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Creating Account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              {activeTab === "login" 
                ? "Don't have an account? " 
                : "Already have an account? "}
              <Button 
                variant="link" 
                className="p-0 h-auto" 
                onClick={() => setActiveTab(activeTab === "login" ? "register" : "login")}
              >
                {activeTab === "login" ? "Register" : "Login"}
              </Button>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}