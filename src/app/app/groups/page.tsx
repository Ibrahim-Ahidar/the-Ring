import { redirect } from "next/navigation";

/** The groups list is the "Groups" filter of the chats inbox. */
export default function GroupsPage() {
  redirect("/app/chats?filter=groups");
}
