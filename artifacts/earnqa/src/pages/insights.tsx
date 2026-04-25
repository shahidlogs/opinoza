import { useState } from "react";
import { motion } from "framer-motion";
import { usePageMeta } from "@/lib/page-meta";
import {
  useGetAnalyticsByCategory,
  useGetAnalyticsByGender,
  useGetAnalyticsByAge,
  useGetAnalyticsByCity,
  useGetPlatformSummary,
  useGetCategories,
} from "@workspace/api-client-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const COLORS = ["#F59E0B", "#D97706", "#3B82F6", "#10B981", "#8B5CF6", "#EC4899", "#F97316", "#06B6D4", "#EF4444", "#14B8A6"];

function NoData() {
  return (
    <div className="h-52 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30">
        <path d="M3 3h18v18H3zM3 9h18M9 21V9"/>
      </svg>
      No data yet — answers will appear here
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-52 bg-muted rounded-xl animate-pulse" />;
}

export default function Insights() {
  usePageMeta(
    "Insights – Opinoza",
    "Explore real-time opinion trends on Opinoza. See how people answer questions by category, age, gender, and city.",
    "https://opinoza.com/insights",
  );

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedGender, setSelectedGender] = useState("");
  const [selectedAge, setSelectedAge] = useState("");

  const { data: catData, isLoading: catLoading } = useGetAnalyticsByCategory({});
  const { data: genderData, isLoading: genderLoading } = useGetAnalyticsByGender({});
  const { data: ageData, isLoading: ageLoading } = useGetAnalyticsByAge({});
  const { data: cityData, isLoading: cityLoading } = useGetAnalyticsByCity({});
  const { data: summary, isLoading: summaryLoading } = useGetPlatformSummary();
  const { data: categoriesData } = useGetCategories();

  const categories = catData?.data ?? [];
  const genders = genderData?.data ?? [];
  const ages = ageData?.data ?? [];
  const cities = cityData?.data ?? [];
  const allCategories = categoriesData?.categories ?? [];

  // Filtered views (client-side for now)
  const filteredGenders = selectedGender ? genders.filter(g => g.gender === selectedGender) : genders;
  const filteredAges = selectedAge ? ages.filter(a => a.ageGroup === selectedAge) : ages;
  const filteredCities = cities;
  const filteredCategories = selectedCategory ? categories.filter(c => c.category === selectedCategory) : categories;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Public Insights</h1>
        <p className="text-muted-foreground mt-2">Aggregated data from all community answers — updated in real time</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Answers Today", value: summaryLoading ? "—" : (summary?.totalAnswersToday ?? 0) },
          { label: "Answers This Week", value: summaryLoading ? "—" : (summary?.totalAnswersThisWeek ?? 0) },
          { label: "Active Questions", value: summaryLoading ? "—" : (summary?.totalActiveQuestions ?? 0) },
          { label: "Cents Earned Today", value: summaryLoading ? "—" : `${summary?.totalCentsEarnedToday ?? 0}¢` },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="bg-card border border-card-border rounded-xl p-5 shadow-sm text-center"
          >
            <div className="text-2xl font-bold text-amber-600">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1 font-medium">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card border border-card-border rounded-xl p-4 mb-8 flex flex-wrap gap-3 items-center">
        <span className="text-sm font-semibold text-foreground">Filter charts:</span>

        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">All Categories</option>
          {allCategories.map(c => <option key={c.category} value={c.category}>{c.category}</option>)}
        </select>

        <select
          value={selectedGender}
          onChange={e => setSelectedGender(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">All Genders</option>
          {genders.map(g => <option key={g.gender} value={g.gender}>{g.gender}</option>)}
        </select>

        <select
          value={selectedAge}
          onChange={e => setSelectedAge(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">All Ages</option>
          {ages.map(a => <option key={a.ageGroup} value={a.ageGroup}>{a.ageGroup}</option>)}
        </select>

        {(selectedCategory || selectedGender || selectedAge) && (
          <button
            onClick={() => { setSelectedCategory(""); setSelectedGender(""); setSelectedAge(""); }}
            className="px-3 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* By Category */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-card border border-card-border rounded-2xl p-6 shadow-sm"
        >
          <h2 className="font-bold text-lg mb-5">Answers by Category</h2>
          {catLoading ? <ChartSkeleton /> : filteredCategories.length === 0 ? <NoData /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={filteredCategories} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={100} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: any) => [`${v} answers`, "Count"]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {filteredCategories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* By Gender */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-card border border-card-border rounded-2xl p-6 shadow-sm overflow-hidden"
        >
          <h2 className="font-bold text-lg mb-5">Answers by Gender</h2>
          {genderLoading ? <ChartSkeleton /> : filteredGenders.length === 0 ? <NoData /> : (
            <ResponsiveContainer width="100%" height={420}>
              <PieChart>
                <Pie
                  data={filteredGenders} dataKey="count" nameKey="gender"
                  cx="50%" cy="44%" outerRadius={130} innerRadius={68}
                  label={false}
                  labelLine={false}
                >
                  {filteredGenders.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: any, name: any, props: any) => [`${v} answers (${props.payload.percentage}%)`, name]}
                />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ paddingTop: "28px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px", fontSize: "13px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* By Age Group */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-card border border-card-border rounded-2xl p-6 shadow-sm"
        >
          <h2 className="font-bold text-lg mb-5">Answers by Age Group</h2>
          {ageLoading ? <ChartSkeleton /> : filteredAges.length === 0 ? <NoData /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={filteredAges}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="ageGroup" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: any) => [`${v} answers`, "Count"]}
                />
                <Bar dataKey="count" fill="#D97706" radius={[4, 4, 0, 0]}>
                  {filteredAges.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* By City */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-card border border-card-border rounded-2xl p-6 shadow-sm"
        >
          <h2 className="font-bold text-lg mb-5">Answers by City (Top 10)</h2>
          {cityLoading ? <ChartSkeleton /> : filteredCities.length === 0 ? <NoData /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={filteredCities} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="city" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={90} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: any) => [`${v} answers`, "Count"]}
                />
                <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]}>
                  {filteredCities.map((_, i) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>

      {/* Top Categories Table */}
      {summary?.topCategories && summary.topCategories.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="mt-8 bg-card border border-card-border rounded-2xl p-6 shadow-sm"
        >
          <h2 className="font-bold text-lg mb-5">Most Active Categories</h2>
          <div className="space-y-3">
            {summary.topCategories.map((cat, i) => (
              <div key={cat.category}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-foreground flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: COLORS[i % COLORS.length] }}>
                      {i + 1}
                    </span>
                    {cat.category}
                  </span>
                  <span className="text-muted-foreground">{cat.percentage}% · {cat.count} answers</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${cat.percentage}%` }}
                    transition={{ duration: 1, delay: 0.5 + i * 0.1 }}
                    className="h-full rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Note for users to fill profile */}
      <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 56%)" strokeWidth="2" className="mt-0.5 shrink-0">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
        </svg>
        <div className="text-sm text-amber-700">
          <strong>Improve the data:</strong> Fill in your city, age group, and gender on your{" "}
          <a href="/profile" className="underline hover:text-amber-900">Profile page</a> to contribute to richer analytics.
          All data is shown in aggregate only.
        </div>
      </div>
    </div>
  );
}
