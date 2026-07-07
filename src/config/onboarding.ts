export const TARGET_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "IN", name: "India" },
  { code: "SG", name: "Singapore" },
  { code: "JP", name: "Japan" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "ZA", name: "South Africa" },
  { code: "NZ", name: "New Zealand" },
] as const;

export const CUSTOMER_TYPES = [
  { code: "B2B", name: "B2B" },
  { code: "B2C", name: "B2C" },
  { code: "ENTERPRISE", name: "Enterprise" },
  { code: "SMB", name: "Small & Medium Business" },
  { code: "STARTUPS", name: "Startups" },
  { code: "GOVERNMENT", name: "Government & Public Sector" },
] as const;

export const ONBOARDING_STEPS = [
  { step: 1, slug: "website", label: "Company website" },
  { step: 2, slug: "email", label: "Work email" },
  { step: 3, slug: "countries", label: "Target countries" },
  { step: 4, slug: "customer-types", label: "Customer types" },
  { step: 5, slug: "start", label: "Start analysis" },
  { step: 6, slug: "review-profile", label: "Review company profile" },
  { step: 7, slug: "review-products", label: "Review products & services" },
] as const;
