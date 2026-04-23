import { generateInterviewQuestions } from "@/lib/interview-flow"
import { InterviewQuestion } from "@/lib/server/ai/interview-flow"
import {
  getQuestionModeForRoleFamily,
  inferRoleIntelligence,
  presentSkillName,
  QuestionMode,
  RoleFamily,
} from "@/lib/server/ai/skills"

type JdStrength = "strong" | "weak" | "edge"
type Seniority = "junior" | "mid" | "senior"

type RoleSpec = {
  id: string
  title: string
  family: RoleFamily
  expectedSubfamily?: string
  coreSkills: string[]
  resumeSkills: string[]
  strongDescription: string
  weakDescription: string
  edgeDescription: string
}

type HarnessCase = {
  id: string
  roleId: string
  title: string
  family: RoleFamily
  expectedSubfamily?: string
  expectedQuestionMode: QuestionMode
  level: Seniority
  jdStrength: JdStrength
  input: {
    jobTitle: string
    jobDescription: string
    coreSkills: string[]
    resumeSkills: string[]
    experienceLevel: Seniority
  }
}

type HarnessCaseResult = {
  case_id: string
  title: string
  level: Seniority
  jd_strength: JdStrength
  expected_role_family: RoleFamily
  inferred_role_family: RoleFamily
  expected_subfamily?: string
  inferred_subfamily?: string
  role_confidence: number
  expected_question_mode: QuestionMode
  actual_question_mode: string
  role_family_match: boolean
  question_mode_match: boolean
  adaptive_mode: boolean
  adaptive_expected: boolean
  relevance_score: number
  failure_handling_score: number
  overall_score: number
  status: "PASS" | "FAIL"
  failures: string[]
  sample_questions: string[]
}

type HarnessSummary = {
  total_cases: number
  passed_cases: number
  failed_cases: number
  role_family_accuracy: number
  question_mode_accuracy: number
  average_relevance: number
  average_failure_handling: number
  overall_system_score: number
}

export type RoleEngineHarnessReport = {
  generated_at: string
  dataset_summary: {
    role_count: number
    case_count: number
    levels: Seniority[]
    jd_strengths: JdStrength[]
  }
  summary: HarnessSummary
  results: HarnessCaseResult[]
}

const LEVELS: Seniority[] = ["junior", "mid", "senior"]
const JD_STRENGTH_BY_LEVEL: Record<Seniority, JdStrength> = {
  junior: "strong",
  mid: "weak",
  senior: "edge",
}

const MODE_EXPECTED_TERMS: Record<QuestionMode, string[]> = {
  technical_problem_solving: ["check", "troubleshoot", "debug", "validate", "problem", "incident"],
  sales_objection_handling: ["objection", "deal", "prospect", "value", "negot", "pipeline"],
  behavioral_people_judgment: ["handle", "situation", "people", "conflict", "judgment", "ownership"],
  operational_scenarios: ["schedule", "prioritize", "delay", "recover", "coordinate", "plan"],
  legal_judgment: ["risk", "judgment", "review", "regulatory", "policy", "interpret"],
  creative_reasoning: ["idea", "feedback", "reasoning", "creative", "direction", "design"],
  communication_service: ["communication", "customer", "trust", "conversation", "service", "support"],
  analytical_business: ["metric", "data", "pattern", "forecast", "numbers", "decision"],
  leadership_decision_making: ["direction", "trade-off", "team", "lead", "decision", "stakeholder"],
}

const NON_TECHNICAL_FORBIDDEN = ["deployment", "rollback", "latency", "query", "production outage"]

const ROLE_SPECS: RoleSpec[] = [
  {
    id: "backend_engineer",
    title: "Backend Engineer",
    family: "technical",
    expectedSubfamily: "backend",
    coreSkills: ["api", "node", "database", "security", "testing"],
    resumeSkills: ["node", "api", "sql", "testing"],
    strongDescription:
      "Build backend services, design APIs, debug production issues, improve system security, and own data integrity across releases.",
    weakDescription: "Own server-side delivery, improve reliability, and work closely with platform and product teams.",
    edgeDescription:
      "The role handles high-impact product delivery where quality, system judgment, and stability matter during fast change.",
  },
  {
    id: "planner_scheduler",
    title: "Planner & Scheduler",
    family: "operations",
    expectedSubfamily: "field_service",
    coreSkills: ["scheduling", "resource allocation", "sla management", "service delivery", "rescheduling"],
    resumeSkills: ["scheduling", "coordination", "customer communication", "service delivery"],
    strongDescription:
      "Coordinate field interventions, update technician schedules, manage customer urgency, balance SLA commitments, and reschedule visits when parts or capacity change.",
    weakDescription:
      "Own planning accuracy, manage daily changes, coordinate with field teams, and keep service work aligned with customer expectations.",
    edgeDescription:
      "This role keeps a fast-moving service operation stable while priorities, timing, and dependencies change throughout the day.",
  },
  {
    id: "inside_sales_saas",
    title: "Inside Sales Executive",
    family: "sales",
    expectedSubfamily: "inside",
    coreSkills: ["sales pipeline management", "prospecting", "negotiation", "crm management", "deal closing"],
    resumeSkills: ["prospecting", "crm", "communication", "negotiation"],
    strongDescription:
      "Qualify inbound and outbound leads, move SaaS opportunities through pipeline stages, handle objections, maintain CRM accuracy, and close commercial discussions.",
    weakDescription:
      "Drive pipeline movement, keep lead follow-up disciplined, and help convert interest into committed business.",
    edgeDescription:
      "The role depends on commercial judgment, strong discovery, and handling hesitation when a deal is close but not yet secure.",
  },
  {
    id: "customer_success_manager",
    title: "Customer Success Manager",
    family: "customer_success",
    expectedSubfamily: "success",
    coreSkills: ["customer success management", "renewal management", "customer retention", "stakeholder management", "customer onboarding"],
    resumeSkills: ["renewals", "onboarding", "customer support", "communication"],
    strongDescription:
      "Own onboarding, adoption, renewal readiness, customer retention, executive communication, and risk recovery for strategic accounts.",
    weakDescription:
      "Help customers stay successful, manage escalations, and improve retention through structured follow-up and partnership.",
    edgeDescription:
      "The role requires judgment across relationship risk, customer pressure, and long-term value realization.",
  },
  {
    id: "talent_acquisition",
    title: "Talent Acquisition Specialist",
    family: "hr",
    expectedSubfamily: "recruiting",
    coreSkills: ["talent acquisition", "candidate sourcing", "candidate screening", "interview management", "stakeholder management"],
    resumeSkills: ["sourcing", "screening", "coordination", "communication"],
    strongDescription:
      "Source candidates, screen for fit, coordinate interview loops, manage recruiter-hiring manager alignment, and reduce candidate drop-off.",
    weakDescription:
      "Own recruiter workflow, candidate movement, hiring coordination, and communication quality across the hiring process.",
    edgeDescription:
      "The role requires strong people judgment under hiring pressure when signals are incomplete and stakeholders disagree.",
  },
  {
    id: "finance_analyst",
    title: "Finance Analyst",
    family: "finance",
    expectedSubfamily: "fpna",
    coreSkills: ["financial reporting", "budgeting", "financial forecasting", "variance analysis", "stakeholder management"],
    resumeSkills: ["budgeting", "forecasting", "reporting", "excel"],
    strongDescription:
      "Build forecasts, explain budget variance, prepare reporting packs, support planning cycles, and recommend actions based on financial signals.",
    weakDescription:
      "Help the business understand numbers, improve forecast quality, and support planning with clear analysis.",
    edgeDescription:
      "The role needs judgment when the financial story is unclear and leadership still expects a confident recommendation.",
  },
  {
    id: "procurement_specialist",
    title: "Procurement Specialist",
    family: "procurement",
    expectedSubfamily: "purchasing",
    coreSkills: ["procurement management", "vendor management", "supplier management", "purchase order management", "cost control"],
    resumeSkills: ["procurement", "vendor management", "coordination", "purchase order"],
    strongDescription:
      "Manage suppliers, control purchase orders, negotiate commercial terms, prevent supply disruption, and balance service needs against cost.",
    weakDescription:
      "Own purchasing flow, vendor coordination, and timely ordering while keeping operational risk low.",
    edgeDescription:
      "The role requires strong judgment when supplier issues, timing pressure, and cost expectations collide.",
  },
  {
    id: "product_marketing_manager",
    title: "Product Marketing Manager",
    family: "marketing",
    expectedSubfamily: "product_marketing",
    coreSkills: ["product positioning", "campaign management", "content strategy", "demand generation", "brand management"],
    resumeSkills: ["content strategy", "campaigns", "branding", "communication"],
    strongDescription:
      "Define positioning, shape campaigns, align go-to-market messaging, build content strategy, and improve demand generation quality.",
    weakDescription:
      "Help the business tell the right story, improve campaign quality, and connect product value to market response.",
    edgeDescription:
      "The role requires creativity and business judgment when customer feedback, brand standards, and revenue goals conflict.",
  },
  {
    id: "manufacturing_supervisor",
    title: "Manufacturing Supervisor",
    family: "manufacturing_industrial",
    coreSkills: ["production planning", "quality control", "safety compliance", "equipment maintenance", "process improvement"],
    resumeSkills: ["production", "quality", "safety", "coordination"],
    strongDescription:
      "Supervise production flow, maintain safety standards, resolve quality issues, coordinate maintenance, and improve plant efficiency.",
    weakDescription:
      "Own day-to-day plant execution, production stability, and safety discipline across the shift.",
    edgeDescription:
      "The role depends on judgment when output targets, quality, and safety do not line up cleanly.",
  },
  {
    id: "site_engineer",
    title: "Site Engineer",
    family: "construction_site",
    coreSkills: ["site coordination", "timeline management", "resource allocation", "safety compliance", "contract execution"],
    resumeSkills: ["site supervision", "coordination", "timeline", "safety"],
    strongDescription:
      "Coordinate site work, track timelines, manage contractor execution, keep safety standards high, and recover delays before they affect delivery.",
    weakDescription:
      "Run site execution, manage daily constraints, and keep work moving safely and on time.",
    edgeDescription:
      "The role requires judgment when safety, schedule, and contractor pressure all compete for the next decision.",
  },
  {
    id: "compliance_officer",
    title: "Compliance Officer",
    family: "legal_compliance",
    coreSkills: ["regulatory compliance", "policy review", "risk assessment", "contract review", "governance"],
    resumeSkills: ["compliance", "policy", "risk", "documentation"],
    strongDescription:
      "Interpret regulations, review policies, assess compliance risk, support audit readiness, and guide the business on safe decisions.",
    weakDescription:
      "Own compliance controls, policy quality, and risk review while supporting fast-moving stakeholders.",
    edgeDescription:
      "The role requires careful judgment when business urgency and regulatory caution point in different directions.",
  },
  {
    id: "patient_care_coordinator",
    title: "Patient Care Coordinator",
    family: "healthcare",
    coreSkills: ["patient coordination", "clinical documentation", "care quality", "communication", "compliance"],
    resumeSkills: ["patient support", "documentation", "communication", "coordination"],
    strongDescription:
      "Coordinate patient interactions, maintain accurate documentation, support care quality, and manage sensitive communication under pressure.",
    weakDescription:
      "Own patient flow, communication clarity, and process accuracy in a regulated care environment.",
    edgeDescription:
      "The role relies on calm judgment when urgency, sensitivity, and documentation discipline all matter at once.",
  },
  {
    id: "corporate_trainer",
    title: "Corporate Trainer",
    family: "education_training",
    coreSkills: ["curriculum planning", "instruction delivery", "learner engagement", "assessment design", "training coordination"],
    resumeSkills: ["training", "facilitation", "content", "communication"],
    strongDescription:
      "Design learning programs, deliver training sessions, assess learner progress, adapt instruction, and improve training effectiveness.",
    weakDescription:
      "Own training delivery, learner engagement, and program improvement across different audiences.",
    edgeDescription:
      "The role requires judgment when engagement drops, feedback conflicts, and learning outcomes still need to improve.",
  },
  {
    id: "fleet_operations_coordinator",
    title: "Fleet Operations Coordinator",
    family: "logistics_warehouse_fleet",
    coreSkills: ["dispatch coordination", "route planning", "fleet coordination", "inventory management", "sla management"],
    resumeSkills: ["dispatch", "route planning", "coordination", "logistics"],
    strongDescription:
      "Coordinate fleet activity, optimize routes, maintain SLA performance, manage delivery exceptions, and keep dispatch decisions responsive.",
    weakDescription:
      "Own transport coordination, route changes, and daily execution quality in a moving logistics environment.",
    edgeDescription:
      "The role needs strong operational judgment when timing, route issues, and service promises all shift at once.",
  },
  {
    id: "creative_content_designer",
    title: "Creative Content Designer",
    family: "creative_design_content",
    coreSkills: ["creative strategy", "content strategy", "design reasoning", "brand management", "stakeholder management"],
    resumeSkills: ["design", "content", "branding", "communication"],
    strongDescription:
      "Create design and content concepts, explain creative reasoning, align with brand direction, and respond well to feedback cycles.",
    weakDescription:
      "Own content and design work that balances clarity, originality, and business intent.",
    edgeDescription:
      "The role relies on reasoning and judgment when feedback is subjective and goals are still evolving.",
  },
  {
    id: "call_center_associate",
    title: "Call Center Associate",
    family: "bpo_call_center",
    coreSkills: ["customer support", "communication", "ticket handling", "de escalation", "sla management"],
    resumeSkills: ["customer support", "calls", "communication", "ticket handling"],
    strongDescription:
      "Handle inbound customer conversations, resolve issues within service levels, manage de-escalation, and keep communication clear under pressure.",
    weakDescription:
      "Own customer conversations, issue handling, and service quality in a high-volume support environment.",
    edgeDescription:
      "The role depends on communication judgment when customers are frustrated and resolution is not immediate.",
  },
  {
    id: "banking_relationship_manager",
    title: "Banking Relationship Manager",
    family: "banking_financial_services",
    coreSkills: ["customer advisory", "risk assessment", "credit evaluation", "kyc compliance", "stakeholder management"],
    resumeSkills: ["banking", "customer management", "kyc", "credit"],
    strongDescription:
      "Manage client relationships, evaluate credit situations, maintain KYC discipline, communicate risk clearly, and support financial decisions.",
    weakDescription:
      "Own financial relationship quality, compliance discipline, and business judgment in a regulated banking context.",
    edgeDescription:
      "The role requires balanced judgment when revenue opportunity, client expectations, and risk controls are all active at once.",
  },
  {
    id: "engineering_manager",
    title: "Engineering Manager",
    family: "leadership_management",
    coreSkills: ["team leadership", "decision making", "stakeholder management", "performance management", "strategy"],
    resumeSkills: ["leadership", "delivery", "stakeholder management", "team management"],
    strongDescription:
      "Lead engineers, set direction, manage delivery trade-offs, coach team performance, and align execution with longer-term product strategy.",
    weakDescription:
      "Own people leadership, delivery decisions, and cross-team direction in a changing environment.",
    edgeDescription:
      "The role depends on leadership judgment when immediate delivery pressure and long-term team health point in different directions.",
  },
]

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

function selectDescription(spec: RoleSpec, strength: JdStrength) {
  if (strength === "strong") {
    return spec.strongDescription
  }
  if (strength === "weak") {
    return spec.weakDescription
  }
  return spec.edgeDescription
}

function buildHarnessCases() {
  return ROLE_SPECS.flatMap((spec) =>
    LEVELS.map((level) => {
      const jdStrength = JD_STRENGTH_BY_LEVEL[level]
      return {
        id: `${spec.id}-${level}`,
        roleId: spec.id,
        title: spec.title,
        family: spec.family,
        expectedSubfamily: spec.expectedSubfamily,
        expectedQuestionMode: getQuestionModeForRoleFamily(spec.family),
        level,
        jdStrength,
        input: {
          jobTitle: spec.title,
          jobDescription: selectDescription(spec, jdStrength),
          coreSkills: spec.coreSkills,
          resumeSkills: spec.resumeSkills,
          experienceLevel: level,
        },
      } satisfies HarnessCase
    })
  )
}

function questionSetText(questions: InterviewQuestion[]) {
  return questions.map((question) => question.question.toLowerCase()).join(" ")
}

function scoreQuestionRelevance(caseItem: HarnessCase, questions: InterviewQuestion[]) {
  const normalizedText = questionSetText(questions)
  const expectedTerms = [...caseItem.input.coreSkills, ...caseItem.input.resumeSkills]
    .map((term) => presentSkillName(term).toLowerCase())
    .filter(Boolean)
  const expectedModeTerms = MODE_EXPECTED_TERMS[caseItem.expectedQuestionMode] ?? []

  const skillHits = expectedTerms.filter((term) => normalizedText.includes(term)).length
  const modeHits = expectedModeTerms.filter((term) => normalizedText.includes(term)).length
  const hasForbiddenTechnical = caseItem.expectedQuestionMode !== "technical_problem_solving"
    ? NON_TECHNICAL_FORBIDDEN.some((phrase) => normalizedText.includes(phrase))
    : false
  const countScore = Math.min(1, questions.length / 6)
  const skillScore = Math.min(1, skillHits / 3)
  const modeScore = Math.min(1, modeHits / 2)
  const forbiddenScore = hasForbiddenTechnical ? 0.3 : 1

  return Number(((countScore * 0.2 + skillScore * 0.45 + modeScore * 0.2 + forbiddenScore * 0.15) * 100).toFixed(2))
}

function scoreFailureHandling(caseItem: HarnessCase, questions: InterviewQuestion[], adaptiveMode: boolean, roleConfidence: number) {
  const normalizedText = questionSetText(questions)
  const genericLeak = normalizedText.includes("general skill") || normalizedText.includes("general-skill")
  const sufficientQuestions = questions.length >= 5
  const adaptiveExpected = caseItem.jdStrength !== "strong"
  const adaptiveScore = adaptiveExpected ? (adaptiveMode || roleConfidence >= 0.45 ? 1 : 0.25) : 1
  const genericScore = genericLeak ? 0 : 1
  const countScore = sufficientQuestions ? 1 : questions.length / 5

  return Number(((adaptiveScore * 0.45 + genericScore * 0.35 + countScore * 0.2) * 100).toFixed(2))
}

function scoreCase(params: {
  caseItem: HarnessCase
  inferredFamily: RoleFamily
  inferredSubfamily?: string
  roleConfidence: number
  actualQuestionMode: string
  adaptiveMode: boolean
  questions: InterviewQuestion[]
}) {
  const roleFamilyMatch = params.inferredFamily === params.caseItem.family
  const questionModeMatch = params.actualQuestionMode === params.caseItem.expectedQuestionMode
  const relevanceScore = scoreQuestionRelevance(params.caseItem, params.questions)
  const failureHandlingScore = scoreFailureHandling(
    params.caseItem,
    params.questions,
    params.adaptiveMode,
    params.roleConfidence
  )

  const overallScore = Number(
    (
      (roleFamilyMatch ? 1 : 0) * 35 +
      (questionModeMatch ? 1 : 0) * 20 +
      relevanceScore * 0.3 +
      failureHandlingScore * 0.15
    ).toFixed(2)
  )

  const failures: string[] = []
  if (!roleFamilyMatch) {
    failures.push("wrong_role_detection")
  }
  if (params.caseItem.expectedSubfamily && params.inferredSubfamily !== params.caseItem.expectedSubfamily) {
    failures.push("wrong_subrole_detection")
  }
  if (!questionModeMatch) {
    failures.push("wrong_question_type")
  }
  if (relevanceScore < 70) {
    failures.push("irrelevant_questions")
  }
  if (failureHandlingScore < 70) {
    failures.push("poor_fallback")
  }

  const status: "PASS" | "FAIL" = failures.length === 0 ? "PASS" : "FAIL"

  return {
    roleFamilyMatch,
    questionModeMatch,
    relevanceScore,
    failureHandlingScore,
    overallScore,
    failures,
    status,
  }
}

export async function runRoleEngineHarness(): Promise<RoleEngineHarnessReport> {
  const cases = buildHarnessCases()

  const results: HarnessCaseResult[] = await Promise.all(cases.map(async (caseItem) => {
    const roleIntelligence = inferRoleIntelligence({
      jobTitle: caseItem.input.jobTitle,
      jobDescription: caseItem.input.jobDescription,
      coreSkills: caseItem.input.coreSkills,
      resumeSkills: caseItem.input.resumeSkills,
    })

    const questions = await generateInterviewQuestions({
      jobTitle: caseItem.input.jobTitle,
      jobDescription: caseItem.input.jobDescription,
      coreSkills: caseItem.input.coreSkills,
      candidateResumeSkills: caseItem.input.resumeSkills,
      experienceLevel: caseItem.input.experienceLevel,
      totalQuestions: 7,
    })

    const score = scoreCase({
      caseItem,
      inferredFamily: roleIntelligence.family,
      inferredSubfamily: roleIntelligence.subfamily,
      roleConfidence: roleIntelligence.confidence,
      actualQuestionMode: roleIntelligence.questionMode,
      adaptiveMode: false,
      questions,
    })

    return {
      case_id: caseItem.id,
      title: caseItem.title,
      level: caseItem.level,
      jd_strength: caseItem.jdStrength,
      expected_role_family: caseItem.family,
      inferred_role_family: roleIntelligence.family,
      expected_subfamily: caseItem.expectedSubfamily,
      inferred_subfamily: roleIntelligence.subfamily,
      role_confidence: roleIntelligence.confidence,
      expected_question_mode: caseItem.expectedQuestionMode,
      actual_question_mode: roleIntelligence.questionMode,
      role_family_match: score.roleFamilyMatch,
      question_mode_match: score.questionModeMatch,
      adaptive_mode: false,
      adaptive_expected: caseItem.jdStrength !== "strong",
      relevance_score: score.relevanceScore,
      failure_handling_score: score.failureHandlingScore,
      overall_score: score.overallScore,
      status: score.status,
      failures: score.failures,
      sample_questions: questions.slice(0, 3).map((question) => question.question),
    }
  }))

  const summary: HarnessSummary = {
    total_cases: results.length,
    passed_cases: results.filter((result) => result.status === "PASS").length,
    failed_cases: results.filter((result) => result.status === "FAIL").length,
    role_family_accuracy: Number(
      ((results.filter((result) => result.role_family_match).length / Math.max(1, results.length)) * 100).toFixed(2)
    ),
    question_mode_accuracy: Number(
      ((results.filter((result) => result.question_mode_match).length / Math.max(1, results.length)) * 100).toFixed(2)
    ),
    average_relevance: average(results.map((result) => result.relevance_score)),
    average_failure_handling: average(results.map((result) => result.failure_handling_score)),
    overall_system_score: average(results.map((result) => result.overall_score)),
  }

  return {
    generated_at: new Date().toISOString(),
    dataset_summary: {
      role_count: ROLE_SPECS.length,
      case_count: cases.length,
      levels: LEVELS,
      jd_strengths: ["strong", "weak", "edge"],
    },
    summary,
    results,
  }
}
