import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";

import { useAuthSession } from "./src/hooks/useAuthSession";
import { HeroScreen } from "./src/screens/HeroScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { RecipeExplorerScreen } from "./src/screens/RecipeExplorerScreen";
import { SignInScreen } from "./src/screens/SignInScreen";
import { SignUpScreen } from "./src/screens/SignUpScreen";

type Route = "hero" | "signin" | "signup" | "recipes" | "profile";

export default function App() {
  const auth = useAuthSession();
  const [route, setRoute] = useState<Route>("hero");

  useEffect(() => {
    if (auth.session) {
      if (route === "hero" || route === "signin" || route === "signup") {
        setRoute("recipes");
      }
    } else if (route === "recipes" || route === "profile") {
      setRoute("hero");
    }
  }, [auth.session, route]);

  const openHero = useCallback(() => {
    auth.clearFeedback();
    setRoute("hero");
  }, [auth]);

  const openSignIn = useCallback(() => {
    auth.clearFeedback();
    setRoute("signin");
  }, [auth]);

  const openSignUp = useCallback(() => {
    auth.clearFeedback();
    setRoute("signup");
  }, [auth]);

  const handleSignOut = useCallback(() => {
    auth.signOut();
    setRoute("hero");
  }, [auth]);

  return (
    <>
      <StatusBar style="dark" />
      {route === "hero" ? (
        <HeroScreen
          isSignedIn={Boolean(auth.session)}
          onSignInPress={openSignIn}
          onSignUpPress={openSignUp}
          onContinuePress={() => setRoute("recipes")}
        />
      ) : null}

      {route === "signin" ? (
        <SignInScreen
          isSubmitting={auth.isSubmitting}
          error={auth.error}
          onSubmit={auth.signIn}
          onBack={openHero}
          onOpenSignUp={openSignUp}
        />
      ) : null}

      {route === "signup" ? (
        <SignUpScreen
          isSubmitting={auth.isSubmitting}
          error={auth.error}
          info={auth.info}
          onSubmit={auth.signUp}
          onBack={openHero}
          onOpenSignIn={openSignIn}
        />
      ) : null}

      {route === "recipes" && auth.session && auth.accessToken ? (
        <RecipeExplorerScreen
          session={auth.session}
          accessToken={auth.accessToken}
          isRefreshingAccess={auth.isRefreshingAccess}
          authError={auth.error}
          onRefreshAccess={auth.refreshAccess}
          onOpenProfile={() => setRoute("profile")}
          onSignOut={handleSignOut}
        />
      ) : null}

      {route === "profile" && auth.session && auth.accessToken ? (
        <ProfileScreen
          session={auth.session}
          accessToken={auth.accessToken}
          onBack={() => setRoute("recipes")}
          onRefreshAccess={auth.refreshAccess}
          onSignOut={handleSignOut}
        />
      ) : null}
    </>
  );
}
