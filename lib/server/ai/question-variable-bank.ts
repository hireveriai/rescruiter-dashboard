import { RoleFamily } from "@/lib/server/ai/skills"

export type VariableCategory = "system" | "problem" | "scenario" | "constraint" | "goal" | "artifact"

export type DomainVariableSet = {
  domain: RoleFamily
  variables: Record<VariableCategory, string[]>
}

export const QUESTION_VARIABLE_BANK: Record<RoleFamily, DomainVariableSet> = {
  technical: {
    domain: "technical",
    variables: {
      system: ["service architecture", "database platform", "API layer", "monitoring stack", "deployment flow", "data pipeline"],
      problem: ["an alert points to a deeper issue", "performance drops under load", "a security concern surfaces", "a change affects reliability", "a recurring incident starts spreading", "the root cause is not obvious"],
      scenario: ["several technical signals appear at once", "a production issue affects reliability", "the system behaves differently than expected", "a release increases operational risk", "an important dependency starts failing", "a critical workflow slows down"],
      constraint: ["reliability cannot be compromised", "you have limited time to isolate the issue", "the business impact is growing", "the team needs a safe fix first", "you need to reduce risk before changing anything", "there is incomplete information at first"],
      goal: ["restore stability quickly", "reduce recurring failures", "improve system resilience", "protect performance under load", "tighten security posture", "make the architecture easier to support"],
      artifact: ["logs", "alerts", "metrics", "query plans", "dashboards", "runbooks"],
    },
  },
  sales: {
    domain: "sales",
    variables: {
      system: ["sales pipeline", "account plan", "forecasting process", "deal review flow", "CRM workflow", "renewal motion"],
      problem: ["a prospect hesitates late in the cycle", "pipeline health weakens", "a deal stalls unexpectedly", "forecast confidence drops", "customer objections keep repeating", "a handoff affects momentum"],
      scenario: ["several deals are at risk at the same time", "the buyer changes priorities", "timing and value questions come up together", "a major account needs re-engagement", "the team must recover trust quickly", "the quarter depends on a few key opportunities"],
      constraint: ["the buying window is narrow", "the relationship is still developing", "internal resources are limited", "the customer wants more certainty quickly", "several stakeholders are influencing the decision", "the outcome has visibility at leadership level"],
      goal: ["move the deal forward with clarity", "improve conversion quality", "protect forecast accuracy", "strengthen customer confidence", "reduce sales friction", "close with the right fit"],
      artifact: ["pipeline review", "forecast numbers", "account notes", "customer feedback", "deal metrics", "CRM history"],
    },
  },
  customer_success: {
    domain: "customer_success",
    variables: {
      system: ["customer journey", "renewal plan", "onboarding flow", "success review process", "service recovery plan", "stakeholder engagement model"],
      problem: ["customer confidence starts slipping", "adoption stalls", "renewal risk rises", "stakeholder alignment weakens", "service expectations drift", "a relationship issue surfaces"],
      scenario: ["several priorities compete for the same customer account", "the customer escalates while outcomes are still unclear", "adoption signals are mixed", "a key stakeholder changes direction", "the account needs recovery under pressure", "internal and customer expectations diverge"],
      constraint: ["retention still matters most", "trust needs to be protected", "the customer expects visible progress quickly", "the issue spans more than one team", "the timeline is tight", "the account is strategically important"],
      goal: ["restore confidence", "improve adoption", "protect renewal health", "increase stakeholder alignment", "reduce churn risk", "create a more stable customer experience"],
      artifact: ["usage data", "renewal signals", "account notes", "customer feedback", "health metrics", "success plans"],
    },
  },
  hr: {
    domain: "hr",
    variables: {
      system: ["hiring process", "candidate journey", "interview workflow", "employee relations process", "onboarding plan", "workforce process"],
      problem: ["candidate quality starts slipping", "stakeholder alignment breaks down", "employee concerns escalate", "the process slows unexpectedly", "feedback conflicts", "hiring momentum drops"],
      scenario: ["the business needs a decision quickly", "several stakeholders want different outcomes", "timelines and quality are in tension", "a sensitive situation requires judgment", "the candidate experience starts weakening", "a people issue has wider impact"],
      constraint: ["fairness must be preserved", "communication has to stay clear", "the process still needs consistency", "confidentiality matters", "the business expects speed", "trust cannot be lost"],
      goal: ["improve hiring quality", "protect candidate experience", "resolve the issue fairly", "improve people decisions", "keep the process reliable", "strengthen stakeholder trust"],
      artifact: ["candidate feedback", "process data", "interview notes", "engagement signals", "policy guidance", "manager feedback"],
    },
  },
  finance: {
    domain: "finance",
    variables: {
      system: ["forecasting model", "budget process", "reporting workflow", "controls framework", "close process", "planning cycle"],
      problem: ["the numbers point in different directions", "variance keeps widening", "forecast confidence drops", "a control concern appears", "reporting quality weakens", "cost pressure increases unexpectedly"],
      scenario: ["leadership needs an answer before the picture is complete", "several business signals conflict", "timing pressure affects decision quality", "the issue affects both accuracy and trust", "a change needs to be reflected quickly", "the business depends on the next call being sound"],
      constraint: ["accuracy still matters", "there is incomplete information", "the reporting deadline is close", "several teams influence the numbers", "the outcome has budget impact", "the decision will be closely reviewed"],
      goal: ["improve decision quality", "tighten forecast accuracy", "reduce reporting risk", "clarify the business picture", "strengthen financial controls", "support better planning"],
      artifact: ["forecast", "variance report", "budget data", "financial statements", "trend analysis", "performance metrics"],
    },
  },
  procurement: {
    domain: "procurement",
    variables: {
      system: ["procurement workflow", "supplier model", "inventory process", "vendor review cycle", "sourcing plan", "purchase order flow"],
      problem: ["supplier performance becomes inconsistent", "inventory risk increases", "cost pressure rises", "delivery reliability weakens", "a sourcing decision is delayed", "vendor coordination breaks down"],
      scenario: ["cost, speed, and reliability all compete at once", "the supply picture changes quickly", "a vendor issue affects business continuity", "multiple teams depend on one sourcing decision", "availability and commitments drift apart", "the plan needs to be revised under pressure"],
      constraint: ["service continuity still matters", "cost cannot be ignored", "the vendor relationship is important", "time is limited", "quality must be protected", "several dependencies are already in motion"],
      goal: ["improve supplier reliability", "reduce sourcing risk", "protect continuity", "improve cost control", "tighten vendor performance", "keep procurement decisions practical"],
      artifact: ["vendor scorecard", "inventory data", "purchase history", "delivery metrics", "cost analysis", "supplier feedback"],
    },
  },
  marketing: {
    domain: "marketing",
    variables: {
      system: ["campaign strategy", "content engine", "demand generation process", "brand plan", "go-to-market workflow", "channel mix"],
      problem: ["results weaken across channels", "the audience response becomes inconsistent", "campaign performance stalls", "brand fit becomes unclear", "the message loses traction", "conversion quality drops"],
      scenario: ["timing matters and the signal is still mixed", "different channels tell different stories", "the campaign needs to recover quickly", "stakeholders want clarity on what is working", "the launch window is tight", "creative and business goals compete"],
      constraint: ["brand consistency still matters", "resources are limited", "timing is important", "the audience is already reacting", "stakeholders want a clear direction", "measurement is incomplete at first"],
      goal: ["improve campaign effectiveness", "tighten positioning", "increase conversion quality", "improve message clarity", "protect brand trust", "make the next iteration stronger"],
      artifact: ["campaign metrics", "channel data", "audience feedback", "performance report", "conversion data", "content results"],
    },
  },
  operations: {
    domain: "operations",
    variables: {
      system: ["service schedule", "dispatch plan", "resource plan", "field support workflow", "service delivery model", "operational handoff"],
      problem: ["priorities suddenly compete for the same time window", "a planned visit can no longer happen as expected", "parts and people stop lining up cleanly", "service commitments start drifting", "an urgent issue disrupts the plan", "execution starts slipping under pressure"],
      scenario: ["a required part is not available before a planned visit", "two urgent interventions compete for the same resource", "customer urgency and field capacity pull in different directions", "the day changes after the schedule is already committed", "service levels are at risk", "a handoff breaks down between teams"],
      constraint: ["customer commitments still need to be protected", "engineer availability changes at the last minute", "service levels still matter", "several stakeholders are already involved", "the schedule cannot simply be reset", "time pressure is growing"],
      goal: ["protect service reliability", "improve schedule stability", "reduce avoidable delays", "improve coordination across teams", "use resources more effectively", "keep execution aligned under pressure"],
      artifact: ["service levels", "schedule data", "dispatch updates", "operational metrics", "customer commitments", "weekly numbers"],
    },
  },
  manufacturing_industrial: {
    domain: "manufacturing_industrial",
    variables: {
      system: ["production plan", "quality process", "maintenance workflow", "shop-floor coordination", "capacity plan", "operating model"],
      problem: ["output becomes less stable", "quality concerns rise", "maintenance pressure increases", "capacity gets tighter", "a process bottleneck emerges", "the plan starts slipping"],
      scenario: ["production and quality goals are both under pressure", "equipment reliability affects delivery", "a bottleneck limits throughput", "different teams depend on the same capacity", "safety and speed compete", "the root issue is not immediately clear"],
      constraint: ["quality must be protected", "safety cannot be compromised", "downtime is costly", "capacity is tight", "the schedule is already committed", "cross-team coordination matters"],
      goal: ["improve throughput responsibly", "reduce quality escapes", "stabilize production", "improve process reliability", "protect safety and output together", "improve operational resilience"],
      artifact: ["quality data", "production metrics", "maintenance logs", "downtime reports", "capacity data", "shift reports"],
    },
  },
  construction_site: {
    domain: "construction_site",
    variables: {
      system: ["site plan", "delivery schedule", "resource plan", "contract execution flow", "site coordination model", "project timeline"],
      problem: ["site progress starts slipping", "resource pressure increases", "a dependency blocks execution", "trade coordination weakens", "risk grows on the critical path", "the plan no longer matches site reality"],
      scenario: ["several workstreams depend on one delayed activity", "site conditions force a change to the plan", "safety and timeline pressure arrive together", "a contractor issue affects progress", "stakeholders need a decision before the picture is complete", "resources and commitments drift apart"],
      constraint: ["safety still matters most", "the timeline is under pressure", "the contract commitments remain in place", "site coordination is already complex", "rework is costly", "multiple parties are involved"],
      goal: ["protect progress", "improve site coordination", "reduce avoidable delays", "keep delivery realistic", "manage project risk better", "improve execution discipline"],
      artifact: ["site updates", "timeline data", "progress reports", "resource status", "contract milestones", "daily logs"],
    },
  },
  legal_compliance: {
    domain: "legal_compliance",
    variables: {
      system: ["policy framework", "contract review process", "governance model", "risk review process", "compliance workflow", "decision record"],
      problem: ["the safest path is not obvious", "risk exposure increases", "a policy issue needs interpretation", "the right answer is not clear-cut", "several obligations compete", "a compliance concern affects the business decision"],
      scenario: ["the business needs a quick answer with incomplete context", "risk and practicality point in different directions", "a decision could set a broader precedent", "several stakeholders want different outcomes", "timing pressure affects judgment", "the issue extends beyond one immediate case"],
      constraint: ["risk still needs to be contained", "the decision must remain defensible", "stakeholders need clarity quickly", "the issue may create precedent", "documentation matters", "the practical business context cannot be ignored"],
      goal: ["make the decision defensible", "reduce compliance risk", "improve policy clarity", "support sound judgment", "protect the business without overcorrecting", "make governance more practical"],
      artifact: ["policy guidance", "risk review", "contract language", "decision notes", "regulatory guidance", "issue summary"],
    },
  },
  healthcare: {
    domain: "healthcare",
    variables: {
      system: ["care workflow", "patient coordination model", "clinical process", "quality review process", "care delivery plan", "handoff process"],
      problem: ["care coordination becomes less clear", "quality risk increases", "communication gaps affect the patient experience", "priorities compete unexpectedly", "the usual process no longer fits the situation", "the care plan needs adjustment under pressure"],
      scenario: ["patient needs change quickly", "several people influence the outcome", "timing and quality both matter", "the situation affects both care and coordination", "different signals need interpretation", "the next step is not straightforward"],
      constraint: ["care quality still matters most", "communication has to remain clear", "timing is sensitive", "the team needs alignment", "documentation still matters", "the response has patient impact"],
      goal: ["improve care quality", "strengthen coordination", "reduce avoidable risk", "improve the patient experience", "support clearer judgment", "make the workflow more reliable"],
      artifact: ["clinical notes", "care data", "quality measures", "patient feedback", "handoff information", "outcome trends"],
    },
  },
  education_training: {
    domain: "education_training",
    variables: {
      system: ["learning plan", "instruction model", "training workflow", "curriculum design", "assessment approach", "learner support process"],
      problem: ["learner engagement drops", "the current method is not landing", "feedback suggests mixed outcomes", "progress becomes uneven", "the plan needs adjustment", "several learning needs compete"],
      scenario: ["learners respond differently to the same material", "time is limited but quality still matters", "feedback points in different directions", "the audience needs clearer support", "the plan must adjust mid-course", "several stakeholders care about the outcome"],
      constraint: ["clarity still matters", "the audience is mixed", "time is limited", "the learning goal cannot change", "support needs to stay practical", "different learning needs are in play"],
      goal: ["improve learner outcomes", "increase engagement", "make the instruction clearer", "improve assessment quality", "adjust the experience more effectively", "make training more practical"],
      artifact: ["assessment results", "learner feedback", "completion data", "training notes", "engagement metrics", "session outcomes"],
    },
  },
  logistics_warehouse_fleet: {
    domain: "logistics_warehouse_fleet",
    variables: {
      system: ["dispatch workflow", "route plan", "warehouse process", "fleet schedule", "inventory flow", "delivery model"],
      problem: ["timing starts slipping", "inventory and dispatch stop aligning", "a route plan becomes unstable", "delivery reliability weakens", "capacity pressure rises", "handoffs create avoidable delays"],
      scenario: ["several deliveries compete for the same capacity", "route conditions change after the plan is set", "warehouse timing affects downstream commitments", "a delay ripples across the operation", "service expectations remain fixed", "multiple moving parts change at once"],
      constraint: ["service commitments still matter", "capacity is limited", "timing remains tight", "the workflow is already in motion", "the cost of rework is high", "the operation depends on coordination"],
      goal: ["improve delivery reliability", "reduce avoidable delays", "improve flow across the operation", "use capacity more effectively", "tighten coordination", "make the operation more stable"],
      artifact: ["route data", "inventory status", "dispatch updates", "delivery metrics", "warehouse reports", "capacity numbers"],
    },
  },
  creative_design_content: {
    domain: "creative_design_content",
    variables: {
      system: ["creative process", "content workflow", "design review flow", "brand system", "campaign concept", "content plan"],
      problem: ["feedback pulls in different directions", "the work loses clarity", "stakeholder expectations conflict", "the idea is strong but fit is uncertain", "the direction needs refinement", "creative quality and business needs compete"],
      scenario: ["several stakeholders want different outcomes", "the concept has to evolve quickly", "brand and performance goals both matter", "the audience response is mixed", "timing is tight but the work still needs craft", "the team needs clearer direction"],
      constraint: ["the brand still matters", "quality cannot be lost", "time is limited", "the business goal is fixed", "several viewpoints need to be balanced", "the output has to stay practical"],
      goal: ["improve creative clarity", "strengthen audience response", "balance craft and business fit", "make feedback more useful", "improve the final direction", "tighten the creative process"],
      artifact: ["creative brief", "performance data", "audience feedback", "design review notes", "campaign results", "content metrics"],
    },
  },
  bpo_call_center: {
    domain: "bpo_call_center",
    variables: {
      system: ["support workflow", "ticket handling process", "service process", "call resolution flow", "quality process", "team escalation path"],
      problem: ["customer interactions start going off track", "service consistency weakens", "response quality varies", "a queue issue affects outcomes", "quality and speed pull in different directions", "an escalation pattern starts growing"],
      scenario: ["the customer is frustrated and clarity matters quickly", "several cases compete for attention", "the queue is under pressure", "service expectations remain high", "a handoff affects resolution quality", "the team needs to recover control fast"],
      constraint: ["service levels still matter", "customer trust needs protection", "time pressure is high", "the workflow cannot stop", "quality still matters", "communication has to stay clear"],
      goal: ["improve resolution quality", "reduce escalation risk", "keep service levels stable", "improve communication under pressure", "make handoffs cleaner", "support more consistent customer outcomes"],
      artifact: ["ticket data", "service levels", "quality scores", "call notes", "customer feedback", "resolution metrics"],
    },
  },
  banking_financial_services: {
    domain: "banking_financial_services",
    variables: {
      system: ["risk review process", "customer advisory process", "credit workflow", "service model", "compliance process", "decision framework"],
      problem: ["risk and opportunity pull in different directions", "the right decision is not obvious", "customer needs and controls compete", "the picture is incomplete", "the decision has longer-term implications", "confidence in the next step weakens"],
      scenario: ["the numbers support more than one interpretation", "the customer expects clarity quickly", "the situation has regulatory implications", "several stakeholders need a decision", "timing pressure affects judgment", "the next call could have broader impact"],
      constraint: ["risk still matters", "controls must be respected", "the customer needs a practical answer", "trust cannot be weakened", "the issue has visibility", "the decision may be reviewed closely"],
      goal: ["improve decision quality", "reduce risk exposure", "support better customer judgment", "strengthen control discipline", "make the recommendation more defensible", "improve clarity under pressure"],
      artifact: ["risk data", "customer profile", "financial data", "decision notes", "performance trends", "control findings"],
    },
  },
  leadership_management: {
    domain: "leadership_management",
    variables: {
      system: ["operating model", "team process", "decision framework", "planning cycle", "cross-functional workflow", "performance rhythm"],
      problem: ["direction becomes less clear", "ownership gets blurred", "the team faces competing priorities", "execution and strategy drift apart", "a decision has wider impact", "pressure starts affecting consistency"],
      scenario: ["the team needs direction with incomplete information", "short-term pressure competes with longer-term ownership", "several stakeholders want different outcomes", "the issue affects more than one function", "the next decision sets the tone for others", "alignment needs to be rebuilt quickly"],
      constraint: ["trust still matters", "the team needs clarity", "several priorities are legitimate", "the issue has visibility", "the decision may set precedent", "execution still has to continue"],
      goal: ["improve alignment", "make the decision clearer", "strengthen ownership", "improve execution under pressure", "balance immediate needs with longer-term direction", "support stronger team judgment"],
      artifact: ["performance trends", "team feedback", "operating metrics", "decision notes", "priority reviews", "stakeholder feedback"],
    },
  },
  general_business: {
    domain: "general_business",
    variables: {
      system: ["workflow", "planning process", "service process", "team process", "operating rhythm", "delivery model"],
      problem: ["priorities compete unexpectedly", "execution starts slipping", "stakeholder expectations diverge", "the plan no longer fits the situation", "several signals point in different directions", "the next move is not obvious"],
      scenario: ["timing pressure is rising", "several teams are involved", "expectations remain high", "the picture is still changing", "the work needs a clear next step", "the outcome still matters despite the disruption"],
      constraint: ["time is limited", "several people are affected", "the response needs to stay practical", "trust still matters", "the issue cannot be ignored", "the workflow is already in motion"],
      goal: ["improve execution quality", "make the next step clearer", "reduce avoidable friction", "improve alignment", "support better decisions", "keep the work moving responsibly"],
      artifact: ["operational data", "stakeholder feedback", "weekly numbers", "team updates", "service data", "progress metrics"],
    },
  },
}

