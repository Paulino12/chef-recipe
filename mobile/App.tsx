import { StatusBar } from "expo-status-bar";
import { RecipeExplorerScreen } from "./src/screens/RecipeExplorerScreen";

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <RecipeExplorerScreen />
    </>
  );
}
