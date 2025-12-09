"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  updateProfile,
  updateEmail,
  updatePassword,
  deleteAccount,
} from "@/lib/actions/auth";
import { toast } from "sonner";
import { User, Mail, Lock, Trash2, Github, Chrome } from "lucide-react";
import { MFASettings } from "./mfa-settings";

type Props = {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string;
    provider: string;
  };
};

export function AccountSettings({ user }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const isOAuthUser = user.provider !== "email";

  const handleUpdateProfile = async (formData: FormData) => {
    setLoading("profile");
    const result = await updateProfile(formData);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Profile updated successfully");
    }
    setLoading(null);
  };

  const handleUpdateEmail = async (formData: FormData) => {
    setLoading("email");
    const result = await updateEmail(formData);
    if (result?.error) {
      toast.error(result.error);
    } else if (result?.message) {
      toast.success(result.message);
    }
    setLoading(null);
  };

  const handleUpdatePassword = async (formData: FormData) => {
    setLoading("password");
    const result = await updatePassword(formData);
    if (result?.error) {
      toast.error(result.error);
    }
    setLoading(null);
  };

  const handleDeleteAccount = async () => {
    setLoading("delete");
    const result = await deleteAccount();
    if (result?.error) {
      toast.error(result.error);
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                name="fullName"
                defaultValue={user.fullName}
                placeholder="John Doe"
              />
            </div>
            <Button type="submit" disabled={loading === "profile"}>
              {loading === "profile" ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Address
          </CardTitle>
          <CardDescription>
            {isOAuthUser
              ? `Your email is managed by ${user.provider}`
              : "Change your email address"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isOAuthUser ? (
            <div className="flex items-center gap-2 text-neutral-500">
              {user.provider === "github" && <Github className="h-4 w-4" />}
              {user.provider === "google" && <Chrome className="h-4 w-4" />}
              <span>{user.email}</span>
            </div>
          ) : (
            <form action={handleUpdateEmail} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={user.email}
                  placeholder="you@example.com"
                />
              </div>
              <Button type="submit" disabled={loading === "email"}>
                {loading === "email" ? "Updating..." : "Update email"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Password Section */}
      {!isOAuthUser && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Password
            </CardTitle>
            <CardDescription>Change your password</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
              <Button type="submit" disabled={loading === "password"}>
                {loading === "password" ? "Updating..." : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Two-Factor Authentication */}
      <MFASettings />

      {/* Connected Accounts */}
      {isOAuthUser && (
        <Card>
          <CardHeader>
            <CardTitle>Connected Account</CardTitle>
            <CardDescription>
              Your account is linked to an external provider
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
              {user.provider === "github" && <Github className="h-5 w-5" />}
              {user.provider === "google" && <Chrome className="h-5 w-5" />}
              <div>
                <p className="font-medium capitalize">{user.provider}</p>
                <p className="text-sm text-neutral-500">{user.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <Trash2 className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete Account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete
                  your account and remove all your data including monitors,
                  heartbeats, and notification channels.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={loading === "delete"}
                >
                  {loading === "delete" ? "Deleting..." : "Delete Account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
