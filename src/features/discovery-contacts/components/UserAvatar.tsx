"use client";

import { UserRound } from "lucide-react";
import { memo } from "react";

import styles from "../discovery-contacts.module.css";

type UserAvatarProps = {
  avatarUrl: string | null;
  size?: "sm" | "lg";
};

function UserAvatarInner({ avatarUrl, size = "sm" }: UserAvatarProps) {
  const className =
    size === "lg"
      ? `${styles.profileAvatar} ${styles.avatarPlaceholder}`
      : `${styles.avatar} ${styles.avatarPlaceholder}`;

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={size === "lg" ? styles.profileAvatar : styles.avatar}
      />
    );
  }

  return (
    <span className={className} aria-hidden="true">
      <UserRound size={size === "lg" ? 32 : 20} />
    </span>
  );
}

export const UserAvatar = memo(UserAvatarInner);
