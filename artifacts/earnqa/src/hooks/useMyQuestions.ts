import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";

export interface MyQuestion {
  id: number;
  title: string;
  type: string;
  category: string;
  status: "pending" | "active" | "rejected";
  pollOptions: string[] | null;
  isCustom: boolean;
  totalAnswers: number;
  createdAt: string;
}

export function useMyQuestions() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["my-questions"],
    enabled: !!isSignedIn,
    queryFn: async (): Promise<{ questions: MyQuestion[] }> => {
      const token = await getToken();
      const res = await fetch("/api/users/me/questions", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch questions");
      return res.json();
    },
  });
}
