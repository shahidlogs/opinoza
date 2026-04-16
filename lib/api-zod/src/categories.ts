export const VALID_CATEGORIES = [
  "Technology",
  "Food & Dining",
  "Health & Wellness",
  "Transport & Travel",
  "Entertainment",
  "Shopping & Brands",
  "Products",
  "Services",
  "Education",
  "Finance & Economy",
  "Environment",
  "Sports",
  "Politics & World Affairs",
  "Lifestyle",
  "Social & Society",
  "Personal Profile",
  "Other",
] as const;

export type Category = (typeof VALID_CATEGORIES)[number];

export const HOME_DISPLAY_CATEGORIES: Category[] = [
  "Technology",
  "Food & Dining",
  "Health & Wellness",
  "Transport & Travel",
  "Entertainment",
  "Shopping & Brands",
  "Products",
  "Services",
  "Education",
  "Finance & Economy",
  "Sports",
  "Lifestyle",
  "Social & Society",
];

export const CATEGORY_ICONS: Record<Category, string> = {
  Technology: "💻",
  "Food & Dining": "🍔",
  "Health & Wellness": "💪",
  "Transport & Travel": "✈️",
  Entertainment: "🎬",
  "Shopping & Brands": "🛍️",
  Products: "📦",
  Services: "🛎️",
  Education: "🎓",
  "Finance & Economy": "💰",
  Environment: "🌱",
  Sports: "⚽",
  "Politics & World Affairs": "🏛️",
  Lifestyle: "🌟",
  "Social & Society": "👥",
  "Personal Profile": "👤",
  Other: "💡",
};

export const CATEGORY_MIGRATION_MAP: Record<string, Category> = {
  Fun: "Entertainment",
  Preferences: "Personal Profile",
  Personal: "Lifestyle",
  Social: "Social & Society",
  Transportation: "Transport & Travel",
  Travel: "Transport & Travel",
  Finance: "Finance & Economy",
  Politics: "Politics & World Affairs",
  "Health & Fitness": "Health & Wellness",
  Healthcare: "Health & Wellness",
  Shopping: "Shopping & Brands",
  Profile: "Personal Profile",
};

export function normalizeCategory(raw: string): Category {
  if ((VALID_CATEGORIES as readonly string[]).includes(raw)) return raw as Category;
  return CATEGORY_MIGRATION_MAP[raw] ?? "Other";
}
