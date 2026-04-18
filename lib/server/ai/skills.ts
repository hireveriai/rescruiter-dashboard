export type SkillBucket =
  | "database"
  | "performance"
  | "operations"
  | "security"
  | "backend"
  | "frontend"
  | "data"
  | "general"

export type SkillType =
  | "technical"
  | "functional"
  | "behavioral"
  | "analytical"
  | "strategic"
  | "operational"

export type SkillUniverseInput = {
  jobDescription?: string
  coreSkills?: string[]
  resumeSkills?: string[]
  resumeText?: string
  jobTitle?: string
}

export type RoleFamily =
  | "technical"
  | "operations"
  | "sales"
  | "customer_success"
  | "hr"
  | "finance"
  | "procurement"
  | "marketing"
  | "manufacturing_industrial"
  | "construction_site"
  | "legal_compliance"
  | "healthcare"
  | "education_training"
  | "logistics_warehouse_fleet"
  | "creative_design_content"
  | "bpo_call_center"
  | "banking_financial_services"
  | "leadership_management"
  | "general_business"

export type QuestionMode =
  | "technical_problem_solving"
  | "sales_objection_handling"
  | "behavioral_people_judgment"
  | "operational_scenarios"
  | "legal_judgment"
  | "creative_reasoning"
  | "communication_service"
  | "analytical_business"
  | "leadership_decision_making"

export type RoleIntelligence = {
  family: RoleFamily
  subfamily?: string
  confidence: number
  adaptiveMode: boolean
  questionMode: QuestionMode
}

export type SkillCoverage = {
  covered: string[]
  remaining: string[]
}

export type SkillScore = {
  skill: string
  bucket: SkillBucket
  average: number
  samples: number
}

export type SkillProfile = {
  skill_scores: Record<string, SkillScore>
  strengths: string[]
  weaknesses: string[]
  overall_weighted_score?: number
}

export type BucketWeights = Partial<Record<SkillBucket, number>>

const SKILL_SYNONYMS: Record<string, string> = {
  postgres: "postgresql",
  postgresql: "postgresql",
  mysql: "mysql",
  sql: "sql",
  mongodb: "mongodb",
  mongo: "mongodb",
  redis: "redis",
  "db tuning": "performance_optimization",
  "database tuning": "performance_optimization",
  "performance tuning": "performance_optimization",
  "query optimization": "performance_optimization",
  "load testing": "performance_optimization",
  "incident response": "operations",
  "on call": "operations",
  "on-call": "operations",
  "site reliability": "operations",
  "sre": "operations",
  "devops": "operations",
  "ci/cd": "operations",
  "ci cd": "operations",
  "kubernetes": "operations",
  "docker": "operations",
  "aws": "operations",
  "azure": "operations",
  "gcp": "operations",
  "security": "security",
  "auth": "security",
  "authentication": "security",
  "authorization": "security",
  "api": "backend",
  "rest": "backend",
  "graphql": "backend",
  "node": "backend",
  "node.js": "backend",
  "javascript": "backend",
  "typescript": "backend",
  "react": "frontend",
  "next.js": "frontend",
  "next": "frontend",
  "html": "frontend",
  "css": "frontend",
  "data pipeline": "data",
  "etl": "data",
  "analytics": "data",
  "planner & scheduler": "scheduling",
  "planner and scheduler": "scheduling",
  planner: "planning",
  scheduler: "scheduling",
  scheduling: "scheduling",
  planning: "planning",
  dispatch: "dispatch_coordination",
  "field service": "field_service_coordination",
  "service delivery": "service_delivery",
  "support center": "support_operations",
  "resource capacity": "capacity_planning",
  "resource allocation": "resource_allocation",
  allocation: "resource_allocation",
  "capacity planning": "capacity_planning",
  "sla": "sla_management",
  "service level": "sla_management",
  "parts availability": "parts_coordination",
  "supply chain": "supply_chain_coordination",
  logistics: "supply_chain_coordination",
  "preventive maintenance": "preventive_maintenance",
  "corrective maintenance": "corrective_maintenance",
  installation: "installation_planning",
  training: "training_coordination",
  urgency: "customer_urgency",
  rescheduling: "rescheduling",
  "customer escalation": "customer_escalation",
  "contract management": "contract_execution",
  sales: "sales_pipeline_management",
  "inside sales": "sales_pipeline_management",
  "outside sales": "sales_pipeline_management",
  "sales pipeline": "sales_pipeline_management",
  "pipeline management": "sales_pipeline_management",
  lead: "lead_management",
  leads: "lead_management",
  prospecting: "prospecting",
  negotiation: "negotiation",
  closing: "deal_closing",
  "account management": "account_management",
  "customer success": "customer_success_management",
  "customer support": "customer_support",
  support: "customer_support",
  retention: "customer_retention",
  renewal: "renewal_management",
  onboarding: "customer_onboarding",
  "relationship management": "stakeholder_management",
  recruiter: "talent_acquisition",
  recruitment: "talent_acquisition",
  hiring: "talent_acquisition",
  sourcing: "candidate_sourcing",
  screening: "candidate_screening",
  interviewing: "interview_management",
  onboarding_hr: "employee_onboarding",
  "employee relations": "employee_relations",
  payroll: "payroll_management",
  compensation: "compensation_management",
  benefits: "benefits_administration",
  finance: "financial_reporting",
  accounting: "financial_reporting",
  budgeting: "budgeting",
  forecasting: "financial_forecasting",
  fpna: "financial_planning_analysis",
  "financial planning": "financial_planning_analysis",
  ar: "accounts_receivable",
  ap: "accounts_payable",
  collections: "collections_management",
  invoicing: "invoice_management",
  procurement: "procurement_management",
  purchasing: "procurement_management",
  vendor: "vendor_management",
  vendors: "vendor_management",
  "vendor management": "vendor_management",
  sourcing_procurement: "supplier_sourcing",
  supplier: "supplier_management",
  "purchase order": "purchase_order_management",
  "inventory planning": "inventory_management",
  marketing: "campaign_management",
  campaigns: "campaign_management",
  seo: "seo",
  sem: "sem",
  branding: "brand_management",
  content: "content_strategy",
  "content marketing": "content_strategy",
  "demand generation": "demand_generation",
  "product marketing": "product_positioning",
  crm: "crm_management",
}

const SKILL_KEYWORDS = [
  "postgresql",
  "mysql",
  "sql",
  "mongodb",
  "redis",
  "database",
  "indexing",
  "replication",
  "backup",
  "performance tuning",
  "query optimization",
  "performance",
  "latency",
  "monitoring",
  "logging",
  "incident",
  "on-call",
  "sre",
  "devops",
  "kubernetes",
  "docker",
  "aws",
  "azure",
  "gcp",
  "security",
  "encryption",
  "oauth",
  "jwt",
  "api",
  "rest",
  "graphql",
  "node",
  "typescript",
  "javascript",
  "react",
  "next.js",
  "etl",
  "data pipeline",
  "analytics",
  "scheduling",
  "planning",
  "dispatch",
  "field service",
  "service delivery",
  "support center",
  "resource capacity",
  "resource allocation",
  "capacity planning",
  "sla",
  "service level",
  "supply chain",
  "parts availability",
  "preventive maintenance",
  "corrective maintenance",
  "installation",
  "training",
  "rescheduling",
  "customer escalation",
  "customer communication",
  "contract management",
  "customer urgency",
  "sales pipeline",
  "lead management",
  "prospecting",
  "negotiation",
  "deal closing",
  "account management",
  "customer success",
  "customer support",
  "customer retention",
  "renewals",
  "onboarding",
  "talent acquisition",
  "candidate sourcing",
  "candidate screening",
  "interview coordination",
  "employee relations",
  "benefits",
  "financial reporting",
  "budgeting",
  "forecasting",
  "accounts payable",
  "accounts receivable",
  "invoicing",
  "procurement",
  "vendor management",
  "supplier management",
  "purchase order",
  "inventory management",
  "campaign management",
  "brand management",
  "content strategy",
  "demand generation",
  "product marketing",
  "seo",
  "sem",
  "crm",
]

const DOMAIN_PHRASES = [
  "planner & scheduler",
  "planner and scheduler",
  "field service coordination",
  "field service",
  "service delivery",
  "support center",
  "resource allocation",
  "resource capacity",
  "capacity planning",
  "dispatch coordination",
  "schedule accuracy",
  "schedule monitoring",
  "sla management",
  "service level",
  "customer urgency",
  "customer escalation",
  "supply chain coordination",
  "parts availability",
  "corrective maintenance",
  "preventive maintenance",
  "installation planning",
  "training coordination",
  "contract execution",
  "visit rescheduling",
  "parts coordination",
  "sales pipeline management",
  "lead qualification",
  "account planning",
  "renewal management",
  "customer onboarding",
  "talent acquisition",
  "candidate sourcing",
  "candidate screening",
  "employee relations",
  "financial reporting",
  "financial planning analysis",
  "accounts payable",
  "accounts receivable",
  "vendor management",
  "supplier sourcing",
  "purchase order management",
  "campaign management",
  "content strategy",
  "demand generation",
  "product positioning",
]

const SCENARIO_KEYWORDS = [
  "production",
  "incident",
  "outage",
  "latency",
  "slow",
  "error",
  "failure",
  "deploy",
  "deployment",
  "rollback",
  "scale",
  "traffic",
  "bug",
  "debug",
  "performance",
  "audit",
  "security",
  "customer",
  "user",
  "compliance",
  "migration",
  "data loss",
  "schedule conflict",
  "missed visit",
  "part shortage",
  "resource shortage",
  "sla breach",
  "customer urgency",
  "reschedule",
  "field agent absence",
  "contract priority",
  "dispatch delay",
  "missed target",
  "pipeline slippage",
  "renewal risk",
  "customer churn",
  "candidate drop-off",
  "hiring bottleneck",
  "budget variance",
  "forecast miss",
  "invoice dispute",
  "vendor delay",
  "stock shortage",
  "campaign underperformance",
  "lead quality issue",
]

const FUNCTIONAL_SKILL_HINTS = [
  "scheduling",
  "resource allocation",
  "resource planning",
  "capacity planning",
  "workflow",
  "process",
  "prioritization",
  "roadmap",
  "delivery",
  "stakeholder",
  "billing",
  "crm",
  "accounting",
  "payroll",
  "compliance",
  "scheduling",
  "planning",
  "dispatch",
  "field service",
  "service delivery",
  "resource allocation",
  "capacity planning",
  "sla management",
  "parts coordination",
  "supply chain coordination",
  "contract execution",
  "rescheduling",
  "sales pipeline management",
  "lead management",
  "account management",
  "customer success management",
  "customer_support",
  "talent acquisition",
  "candidate sourcing",
  "candidate screening",
  "interview management",
  "employee onboarding",
  "payroll management",
  "benefits administration",
  "procurement management",
  "vendor management",
  "supplier management",
  "purchase order management",
  "crm management",
  "contract review",
  "policy review",
  "clinical documentation",
  "curriculum planning",
  "instruction delivery",
  "supplier sourcing",
  "warehouse operations",
  "fleet coordination",
  "ticket handling",
  "kyc compliance",
]

const BEHAVIORAL_SKILL_HINTS = [
  "communication",
  "coordination",
  "collaboration",
  "conflict",
  "leadership",
  "ownership",
  "feedback",
  "mentoring",
  "empathy",
  "influence",
]

const ANALYTICAL_SKILL_HINTS = [
  "analysis",
  "analytics",
  "metrics",
  "reporting",
  "insights",
  "forecasting",
  "data-driven",
  "kpi",
  "forecast",
  "variance",
  "quota",
  "conversion",
  "pipeline",
  "roi",
  "risk assessment",
  "credit evaluation",
  "variance analysis",
]

const STRATEGIC_SKILL_HINTS = [
  "strategy",
  "strategic",
  "roadmap",
  "vision",
  "long-term",
  "business planning",
  "market",
  "go-to-market",
  "account planning",
  "workforce planning",
  "capacity plan",
  "budget planning",
  "territory planning",
  "creative strategy",
  "product positioning",
  "team leadership",
  "performance management",
]

const OPERATIONAL_SKILL_HINTS = [
  "execution",
  "operations",
  "operational",
  "coordination",
  "resource handling",
  "logistics",
  "fulfillment",
  "service delivery",
  "scheduling",
  "planning",
  "dispatch",
  "field service",
  "capacity planning",
  "resource allocation",
  "supply chain coordination",
  "parts coordination",
  "rescheduling",
  "customer support",
  "customer onboarding",
  "renewal management",
  "candidate scheduling",
  "vendor management",
  "purchase order management",
  "inventory management",
  "production planning",
  "equipment maintenance",
  "site coordination",
  "timeline management",
  "route planning",
  "warehouse operations",
  "fleet coordination",
  "ticket handling",
  "clinical documentation",
]

const ROLE_FAMILY_KEYWORDS: Record<RoleFamily, string[]> = {
  technical: [
    "software",
    "developer",
    "engineer",
    "architect",
    "database",
    "devops",
    "platform",
    "sre",
    "backend",
    "frontend",
    "data engineer",
    "qa",
  ],
  operations: [
    "operations",
    "planner",
    "scheduler",
    "dispatch",
    "field service",
    "service delivery",
    "support center",
    "supply chain",
    "logistics",
    "resource allocation",
    "capacity planning",
  ],
  sales: [
    "sales",
    "account executive",
    "business development",
    "bdm",
    "inside sales",
    "outside sales",
    "pipeline",
    "lead generation",
    "prospecting",
    "negotiation",
  ],
  customer_success: [
    "customer success",
    "customer support",
    "support",
    "account management",
    "renewal",
    "retention",
    "onboarding",
    "service desk",
  ],
  hr: [
    "hr",
    "human resources",
    "recruiter",
    "talent acquisition",
    "sourcing",
    "people operations",
    "employee relations",
    "recruitment",
  ],
  finance: [
    "finance",
    "accounting",
    "accounts payable",
    "accounts receivable",
    "fp&a",
    "budgeting",
    "forecasting",
    "payroll",
    "controller",
  ],
  procurement: [
    "procurement",
    "purchasing",
    "vendor",
    "supplier",
    "purchase order",
    "sourcing",
    "inventory",
    "materials",
  ],
  marketing: [
    "marketing",
    "campaign",
    "brand",
    "content",
    "seo",
    "sem",
    "demand generation",
    "product marketing",
    "growth",
  ],
  manufacturing_industrial: [
    "manufacturing",
    "industrial",
    "production",
    "plant",
    "assembly",
    "quality control",
    "maintenance technician",
    "lean",
    "six sigma",
  ],
  construction_site: [
    "construction",
    "site engineer",
    "site supervisor",
    "civil",
    "project site",
    "foreman",
    "contractor",
    "safety",
    "boq",
  ],
  legal_compliance: [
    "legal",
    "compliance",
    "contract law",
    "regulatory",
    "policy",
    "risk",
    "governance",
    "audit",
    "privacy",
  ],
  healthcare: [
    "healthcare",
    "clinical",
    "patient",
    "nurse",
    "doctor",
    "medical",
    "care",
    "hospital",
    "treatment",
  ],
  education_training: [
    "education",
    "training",
    "teacher",
    "faculty",
    "curriculum",
    "instruction",
    "learning",
    "trainer",
    "classroom",
  ],
  logistics_warehouse_fleet: [
    "warehouse",
    "logistics",
    "fleet",
    "transport",
    "dispatch",
    "shipment",
    "delivery route",
    "inventory",
    "fulfillment",
  ],
  creative_design_content: [
    "design",
    "creative",
    "content",
    "copywriter",
    "graphic",
    "ux",
    "ui",
    "visual",
    "storytelling",
  ],
  bpo_call_center: [
    "call center",
    "bpo",
    "voice process",
    "customer calls",
    "ticket handling",
    "service desk",
    "process associate",
    "support executive",
  ],
  banking_financial_services: [
    "banking",
    "bank",
    "financial services",
    "loan",
    "credit",
    "branch",
    "relationship manager",
    "kyc",
    "underwriting",
  ],
  leadership_management: [
    "manager",
    "head of",
    "director",
    "vp",
    "vice president",
    "leadership",
    "team lead",
    "people manager",
    "business head",
  ],
  general_business: [],
}

const ROLE_SUBFAMILY_KEYWORDS: Partial<Record<RoleFamily, Record<string, string[]>>> = {
  sales: {
    b2b: ["b2b", "enterprise sales", "account executive", "saas sales", "solution selling"],
    b2c: ["b2c", "retail sales", "consumer sales"],
    saas: ["saas", "subscription", "mrr", "arr"],
    field: ["field sales", "territory", "on-site sales"],
    inside: ["inside sales", "remote sales", "tele sales"],
  },
  technical: {
    backend: ["backend", "api", "server", "microservice", "node", "java", "python"],
    frontend: ["frontend", "react", "ui", "ux", "javascript", "css", "html"],
    data: ["data engineer", "etl", "pipeline", "warehouse", "analytics", "bi"],
    devops: ["devops", "sre", "platform", "infrastructure", "kubernetes", "docker", "cloud"],
    database: ["database", "sql", "postgresql", "mysql", "dba", "query optimization"],
    qa: ["qa", "testing", "automation testing", "quality assurance"],
  },
  operations: {
    field_service: ["field service", "service delivery", "dispatch", "planner", "scheduler"],
    support_center: ["support center", "service desk", "support operations"],
    supply_chain: ["supply chain", "parts availability", "inventory planning", "warehouse"],
  },
  customer_success: {
    support: ["support", "customer support", "ticket handling", "service desk"],
    success: ["customer success", "retention", "renewal", "adoption"],
  },
  hr: {
    recruiting: ["recruiter", "talent acquisition", "sourcing", "screening"],
    people_ops: ["people operations", "employee relations", "hr operations", "benefits"],
  },
  finance: {
    accounting: ["accounting", "accounts payable", "accounts receivable", "general ledger"],
    fpna: ["fp&a", "forecasting", "budgeting", "variance"],
    payroll: ["payroll", "compensation", "benefits"],
  },
  procurement: {
    sourcing: ["sourcing", "supplier", "vendor onboarding"],
    purchasing: ["purchase order", "purchasing", "procurement"],
  },
  marketing: {
    growth: ["growth", "performance marketing", "demand generation", "seo", "sem"],
    brand: ["brand", "content", "creative", "campaign"],
    product_marketing: ["product marketing", "positioning", "go-to-market"],
  },
}

const ROLE_FAMILY_QUESTION_MODE: Record<RoleFamily, QuestionMode> = {
  technical: "technical_problem_solving",
  operations: "operational_scenarios",
  sales: "sales_objection_handling",
  customer_success: "communication_service",
  hr: "behavioral_people_judgment",
  finance: "analytical_business",
  procurement: "operational_scenarios",
  marketing: "creative_reasoning",
  manufacturing_industrial: "operational_scenarios",
  construction_site: "operational_scenarios",
  legal_compliance: "legal_judgment",
  healthcare: "communication_service",
  education_training: "behavioral_people_judgment",
  logistics_warehouse_fleet: "operational_scenarios",
  creative_design_content: "creative_reasoning",
  bpo_call_center: "communication_service",
  banking_financial_services: "analytical_business",
  leadership_management: "leadership_decision_making",
  general_business: "analytical_business",
}

const ROLE_FAMILY_DEFAULT_SKILLS: Record<RoleFamily, string[]> = {
  technical: ["system design", "troubleshooting", "security", "performance", "testing"],
  operations: ["scheduling", "resource_allocation", "sla_management", "service_delivery", "rescheduling"],
  sales: ["sales_pipeline_management", "prospecting", "negotiation", "deal_closing", "account_management"],
  customer_success: ["customer_success_management", "customer_onboarding", "customer_retention", "renewal_management", "stakeholder_management"],
  hr: ["talent_acquisition", "candidate_sourcing", "candidate_screening", "interview_management", "employee_relations"],
  finance: ["financial_reporting", "budgeting", "financial_forecasting", "accounts_payable", "accounts_receivable"],
  procurement: ["procurement_management", "vendor_management", "supplier_management", "purchase_order_management", "inventory_management"],
  marketing: ["campaign_management", "content_strategy", "demand_generation", "brand_management", "product_positioning"],
  manufacturing_industrial: ["production_planning", "quality_control", "equipment_maintenance", "safety_compliance", "process_improvement"],
  construction_site: ["site_coordination", "safety_compliance", "resource_allocation", "timeline_management", "contract_execution"],
  legal_compliance: ["regulatory_compliance", "policy_review", "risk_assessment", "contract_review", "governance"],
  healthcare: ["patient_coordination", "clinical_documentation", "care_quality", "compliance", "communication"],
  education_training: ["curriculum_planning", "instruction_delivery", "learner_engagement", "assessment_design", "training_coordination"],
  logistics_warehouse_fleet: ["dispatch_coordination", "inventory_management", "route_planning", "warehouse_operations", "fleet_coordination"],
  creative_design_content: ["creative_strategy", "content_strategy", "design_reasoning", "brand_management", "stakeholder_management"],
  bpo_call_center: ["customer_support", "communication", "sla_management", "ticket_handling", "de_escalation"],
  banking_financial_services: ["kyc_compliance", "risk_assessment", "financial_reporting", "customer_advisory", "credit_evaluation"],
  leadership_management: ["team_leadership", "decision_making", "stakeholder_management", "strategy", "performance_management"],
  general_business: ["workflow", "prioritization", "stakeholder_management", "communication", "reporting"],
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

export function normalizeSkillName(raw: string) {
  const normalized = normalizeText(raw)
  return SKILL_SYNONYMS[normalized] ?? normalized
}

export function presentSkillName(raw: string) {
  return normalizeSkillName(raw).replace(/_/g, " ")
}

function extractSkillsFromText(text?: string) {
  if (!text) {
    return []
  }

  const normalizedText = normalizeText(text)
  const matchedKeywords = SKILL_KEYWORDS.filter((skill) => normalizedText.includes(normalizeText(skill)))
  const matchedPhrases = DOMAIN_PHRASES.filter((phrase) => normalizedText.includes(normalizeText(phrase)))
  return Array.from(new Set([...matchedKeywords, ...matchedPhrases]))
}

export function buildSkillUniverse(input: SkillUniverseInput) {
  const skills = new Set<string>()

  input.coreSkills?.forEach((skill) => {
    const normalized = normalizeSkillName(skill)
    if (normalized) {
      skills.add(normalized)
    }
  })

  input.resumeSkills?.forEach((skill) => {
    const normalized = normalizeSkillName(skill)
    if (normalized) {
      skills.add(normalized)
    }
  })

  extractSkillsFromText(input.jobDescription).forEach((skill) => {
    skills.add(normalizeSkillName(skill))
  })

  extractSkillsFromText(input.resumeText).forEach((skill) => {
    skills.add(normalizeSkillName(skill))
  })

  const inferredRoleFamily = inferRoleFamily(input)
  if (skills.size < 5) {
    ROLE_FAMILY_DEFAULT_SKILLS[inferredRoleFamily].forEach((skill) => {
      skills.add(normalizeSkillName(skill))
    })
  }

  return Array.from(skills)
}

export function inferRoleFamily(input: SkillUniverseInput): RoleFamily {
  return inferRoleIntelligence(input).family
}

export function inferRoleSubfamily(family: RoleFamily, input: SkillUniverseInput) {
  const groups = ROLE_SUBFAMILY_KEYWORDS[family]
  if (!groups) {
    return undefined
  }

  const corpus = normalizeText(
    [input.jobTitle, input.jobDescription, ...(input.coreSkills ?? []), ...(input.resumeSkills ?? []), input.resumeText]
      .filter(Boolean)
      .join(" ")
  )

  let winner: string | undefined
  let maxHits = 0
  for (const [subfamily, keywords] of Object.entries(groups)) {
    const hits = keywords.filter((keyword) => corpus.includes(normalizeText(keyword))).length
    if (hits > maxHits) {
      maxHits = hits
      winner = subfamily
    }
  }

  return winner
}

export function getQuestionModeForRoleFamily(family: RoleFamily): QuestionMode {
  return ROLE_FAMILY_QUESTION_MODE[family] ?? "analytical_business"
}

export function inferRoleIntelligence(input: SkillUniverseInput): RoleIntelligence {
  const corpus = normalizeText(
    [input.jobTitle, input.jobDescription, ...(input.coreSkills ?? []), ...(input.resumeSkills ?? []), input.resumeText]
      .filter(Boolean)
      .join(" ")
  )

  let family: RoleFamily = "general_business"
  let maxHits = 0
  let secondBestHits = 0

  for (const [candidateFamily, keywords] of Object.entries(ROLE_FAMILY_KEYWORDS) as Array<[RoleFamily, string[]]>) {
    const hits = keywords.filter((keyword) => corpus.includes(normalizeText(keyword))).length
    if (hits > maxHits) {
      secondBestHits = maxHits
      maxHits = hits
      family = candidateFamily
    } else if (hits > secondBestHits) {
      secondBestHits = hits
    }
  }

  const familyKeywordCount = ROLE_FAMILY_KEYWORDS[family]?.length ?? 1
  const hitDensity = familyKeywordCount > 0 ? maxHits / Math.min(6, familyKeywordCount) : 0
  const margin = maxHits > 0 ? (maxHits - secondBestHits) / Math.max(1, maxHits) : 0
  const confidence = Number(Math.max(0.18, Math.min(0.98, hitDensity * 0.65 + margin * 0.35)).toFixed(2))
  const subfamily = inferRoleSubfamily(family, input)
  const adaptiveMode = confidence < 0.45

  return {
    family,
    subfamily,
    confidence,
    adaptiveMode,
    questionMode: getQuestionModeForRoleFamily(family),
  }
}

export function getFallbackSkillsForRoleFamily(input: SkillUniverseInput | RoleFamily) {
  const family = typeof input === "string" ? input : inferRoleFamily(input)
  return Array.from(
    new Set([
      ...ROLE_FAMILY_DEFAULT_SKILLS[family],
      ...ROLE_FAMILY_DEFAULT_SKILLS.general_business,
    ])
  ).map((skill) => normalizeSkillName(skill))
}

export function bucketSkill(skill: string): SkillBucket {
  const normalized = normalizeSkillName(skill)

  if (["postgresql", "mysql", "mongodb", "sql", "database", "indexing", "replication", "backup"].includes(normalized)) {
    return "database"
  }

  if (["performance_optimization", "performance", "latency", "query optimization"].includes(normalized)) {
    return "performance"
  }

  if (["operations", "devops", "kubernetes", "docker", "aws", "azure", "gcp", "monitoring", "logging"].includes(normalized)) {
    return "operations"
  }

  if (["security", "auth", "authentication", "authorization", "encryption", "jwt", "oauth"].includes(normalized)) {
    return "security"
  }

  if (["api", "rest", "graphql", "node", "node.js", "typescript", "javascript"].includes(normalized)) {
    return "backend"
  }

  if (["react", "next.js", "next", "html", "css"].includes(normalized)) {
    return "frontend"
  }

  if (["data", "etl", "data pipeline", "analytics"].includes(normalized)) {
    return "data"
  }

  if (
    [
      "scheduling",
      "planning",
      "dispatch_coordination",
      "field_service_coordination",
      "service_delivery",
      "support_operations",
      "capacity_planning",
      "resource_allocation",
      "sla_management",
      "parts_coordination",
      "supply_chain_coordination",
      "preventive_maintenance",
      "corrective_maintenance",
      "installation_planning",
      "training_coordination",
      "customer_urgency",
      "rescheduling",
      "customer_escalation",
      "contract_execution",
    ].includes(normalized)
  ) {
    return "operations"
  }

  return "general"
}

export function classifySkillType(skill: string): SkillType {
  const normalized = normalizeSkillName(skill)
  const readable = normalized.replace(/_/g, " ")

  if (BEHAVIORAL_SKILL_HINTS.some((hint) => readable.includes(hint))) {
    return "behavioral"
  }

  if (ANALYTICAL_SKILL_HINTS.some((hint) => readable.includes(hint))) {
    return "analytical"
  }

  if (STRATEGIC_SKILL_HINTS.some((hint) => readable.includes(hint))) {
    return "strategic"
  }

  if (OPERATIONAL_SKILL_HINTS.some((hint) => readable.includes(hint))) {
    return "operational"
  }

  if (FUNCTIONAL_SKILL_HINTS.some((hint) => readable.includes(hint))) {
    return "functional"
  }

  const bucket = bucketSkill(normalized)
  if (bucket !== "general") {
    return "technical"
  }

  return "functional"
}

export function mapQuestionToSkill(questionText: string, skills: string[]) {
  const normalizedText = normalizeText(questionText)
  const normalizedSkills = skills.map((skill) => normalizeSkillName(skill))

  const matched = normalizedSkills.find((skill) => {
    const readable = skill.replace(/_/g, " ")
    return normalizedText.includes(skill) || normalizedText.includes(readable)
  })
  const fallback = normalizedSkills[0]
  const skill = matched ?? fallback ?? "general"

  return {
    skill,
    bucket: bucketSkill(skill),
  }
}

export function assignSkillsToQuestions<T extends { text: string; tags?: string[] }>(questions: T[], skills: string[]) {
  return questions.map((question) => {
    const derived = mapQuestionToSkill(question.text, skills)
    const tags = Array.isArray(question.tags) ? question.tags : []
    const normalizedSkill = normalizeSkillName(derived.skill)
    const nextTags = tags.includes(normalizedSkill) ? tags : [...tags, normalizedSkill]

    return {
      ...question,
      tags: nextTags,
      skill: normalizedSkill,
      skillBucket: derived.bucket,
    }
  })
}

export function computeSkillCoverage(questions: Array<{ skill?: string }>, skills: string[]): SkillCoverage {
  const covered = new Set<string>()
  questions.forEach((question) => {
    if (question.skill) {
      covered.add(normalizeSkillName(question.skill))
    }
  })

  const normalizedSkills = skills.map((skill) => normalizeSkillName(skill))
  const remaining = normalizedSkills.filter((skill) => !covered.has(skill))

  return {
    covered: Array.from(covered),
    remaining,
  }
}

export function scoreAnswerForSkill(answer: string, skill: string) {
  const normalizedAnswer = normalizeText(answer)
  const normalizedSkill = normalizeSkillName(skill)

  let score = 1
  if (normalizedAnswer.includes(normalizedSkill)) {
    score += 2
  }

  if (SCENARIO_KEYWORDS.some((keyword) => normalizedAnswer.includes(keyword))) {
    score += 1
  }

  if (answer.trim().length > 80) {
    score += 1
  }

  return Math.min(5, score)
}

export function aggregateSkillScores(entries: Array<{ skill: string; bucket: SkillBucket; score: number }>, bucketWeights?: BucketWeights): SkillProfile {
  const aggregates = new Map<string, { bucket: SkillBucket; total: number; count: number }>()
  const weights = bucketWeights ?? {}
  let weightedTotal = 0
  let weightedCount = 0

  entries.forEach((entry) => {
    const key = normalizeSkillName(entry.skill)
    const current = aggregates.get(key) ?? { bucket: entry.bucket, total: 0, count: 0 }
    aggregates.set(key, {
      bucket: entry.bucket,
      total: current.total + entry.score,
      count: current.count + 1,
    })

    const weight = typeof weights[entry.bucket] === "number" ? Number(weights[entry.bucket]) : 1
    weightedTotal += entry.score * weight
    weightedCount += weight
  })

  const skillScores: Record<string, SkillScore> = {}
  const ranked = Array.from(aggregates.entries()).map(([skill, data]) => {
    const average = data.count > 0 ? Number((data.total / data.count).toFixed(2)) : 0
    skillScores[skill] = {
      skill,
      bucket: data.bucket,
      average,
      samples: data.count,
    }

    return { skill, average }
  })

  ranked.sort((a, b) => b.average - a.average)

  const overallWeightedScore = weightedCount > 0 ? Number((weightedTotal / weightedCount).toFixed(2)) : 0

  return {
    skill_scores: skillScores,
    strengths: ranked.slice(0, 3).map((item) => item.skill),
    weaknesses: ranked.slice(-3).map((item) => item.skill),
    overall_weighted_score: overallWeightedScore,
  }
}
