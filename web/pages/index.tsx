import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuthenticationStatus } from "@nhost/react";

export default function IndexPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthenticationStatus();

  useEffect(() => {
    if (isLoading) return;
    router.replace(isAuthenticated ? "/orgs" : "/auth");
  }, [isLoading, isAuthenticated, router]);

  return null;
}
