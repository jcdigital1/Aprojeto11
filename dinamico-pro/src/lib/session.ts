// Session boundary: Firebase Authentication owns the session; the frontend wipes the
// react-query cache so one account's data never renders for the next.
import { signOut } from "firebase/auth";
import { queryClient } from "./queryClient";
import { auth } from "./firebase";

export function beginSession(): void {
  queryClient.clear();
}

export async function endSession(redirectTo: string = "/login"): Promise<void> {
  try {
    await signOut(auth);
  } finally {
    queryClient.clear();
    window.location.assign(redirectTo);
  }
}
