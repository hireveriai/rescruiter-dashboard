"use client";

export const ACTION_FEEDBACK_EVENT = "hireveri:action-feedback";

export function showActionFeedback(feedback) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(ACTION_FEEDBACK_EVENT, {
      detail: {
        title: feedback?.title || "Action completed",
        message: feedback?.message || "",
        tone: feedback?.tone || "success",
      },
    })
  );
}
