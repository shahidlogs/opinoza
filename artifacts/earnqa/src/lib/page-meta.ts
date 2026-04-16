import { useEffect } from "react";

const DEFAULT_TITLE = "Opinoza";
const DEFAULT_DESC =
  "Share your opinions and earn real money on Opinoza. Answer polls, ratings, and questions to earn 1¢ per answer. Join thousands of users today.";
const DEFAULT_CANONICAL = "https://opinoza.com";

function setMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

function setCanonical(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

export function usePageMeta(
  title: string,
  description: string,
  canonical?: string,
) {
  useEffect(() => {
    document.title = title ? `${title}` : DEFAULT_TITLE;
    setMeta("description", description || DEFAULT_DESC);
    setCanonical(canonical ?? DEFAULT_CANONICAL);

    return () => {
      document.title = DEFAULT_TITLE;
      setMeta("description", DEFAULT_DESC);
      setCanonical(DEFAULT_CANONICAL);
    };
  }, [title, description, canonical]);
}
