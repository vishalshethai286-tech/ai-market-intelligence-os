export const siteConfig = {
  name: "AI Market Intelligence OS",
  shortName: "AI MI OS",
  description:
    "The operating system for AI-driven market intelligence — signals, research, and insights in one place.",
  nav: [
    { label: "Product", href: "#product" },
    { label: "Pricing", href: "#pricing" },
    { label: "Docs", href: "#docs" },
  ],
} as const;

export const dashboardNav = [
  { label: "Overview", href: "/dashboard" },
  { label: "Market Signals", href: "/dashboard/signals" },
  { label: "Company Profile", href: "/dashboard/company-profile" },
  { label: "Products & Services", href: "/dashboard/products" },
  { label: "Business Brain", href: "/dashboard/business-brain" },
  { label: "Reports", href: "/dashboard/reports" },
  { label: "Settings", href: "/dashboard/settings" },
] as const;
