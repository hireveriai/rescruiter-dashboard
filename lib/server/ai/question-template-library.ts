export type SeedQuestionIntent =
  | "SYSTEM_DESIGN"
  | "TROUBLESHOOTING"
  | "OPTIMIZATION"
  | "EXECUTION"
  | "BEHAVIORAL"
  | "PRIORITIZATION"
  | "COORDINATION"
  | "JUDGMENT"
  | "ANALYSIS"

export type SeedTemplatePlaceholders = {
  skill: string
  system: string
  problem: string
  scenario: string
  constraint: string
  artifact: string
}

export type SeedTemplateBucket = {
  templates: string[]
  gold_standard: string[]
}

export type SeedTemplateLibrary = Record<SeedQuestionIntent, SeedTemplateBucket>

export const SEED_TEMPLATE_LIBRARY: SeedTemplateLibrary = {
  SYSTEM_DESIGN: {
    templates: [
      "How would you design {{system}} so it can handle {{constraint}} without losing reliability?",
      "Walk me through how you would structure {{system}} when {{problem}} is a likely concern.",
      "If you were setting up {{system}}, how would you account for {{constraint}} from the start?",
      "What design choices would you make in {{system}} if {{scenario}} was expected to happen regularly?",
      "How would you balance flexibility and control when designing {{system}} around {{constraint}}?",
      "If {{problem}} started to emerge in {{system}}, what parts of the design would you revisit first?",
    ],
    gold_standard: [
      "How would you design this system so it stays reliable under real operational pressure and still remains easy to evolve?",
      "Walk me through the trade-offs you would make if you had to design this from scratch with imperfect information.",
    ],
  },
  TROUBLESHOOTING: {
    templates: [
      "How do you identify the root cause when {{problem}} affects {{system}}?",
      "When {{scenario}} happens, what do you check first before deciding the next move?",
      "Walk me through how you would stabilize {{system}} when {{problem}} starts impacting results.",
      "What signals tell you that {{problem}} is deeper than it first appears in {{system}}?",
      "How do you separate the immediate fix from the underlying issue when {{scenario}} keeps repeating?",
      "If {{problem}} and {{constraint}} are both in play, how do you decide what to investigate first?",
    ],
    gold_standard: [
      "When a problem surfaces under pressure, how do you decide whether you are looking at a symptom or the real cause?",
      "Walk me through how you stabilize the situation first and then work back to the deeper issue.",
    ],
  },
  OPTIMIZATION: {
    templates: [
      "How do you improve {{system}} when {{constraint}} limits what you can change?",
      "What would you focus on first to make {{system}} more effective when {{problem}} starts slowing things down?",
      "Walk me through how you would improve {{skill}} while still respecting {{constraint}}.",
      "If {{scenario}} kept reducing efficiency, what would you optimize first and why?",
      "How do you decide which improvement in {{system}} creates the most value when resources are limited?",
      "What trade-offs do you weigh when improving {{skill}} while working within {{constraint}}?",
    ],
    gold_standard: [
      "How do you decide which improvement is worth making first when several inefficiencies exist at the same time?",
      "Tell me about how you improve a process without creating a new bottleneck somewhere else.",
    ],
  },
  EXECUTION: {
    templates: [
      "Walk me through how you would deliver {{skill}} from start to finish when {{constraint}} is in play.",
      "How do you keep {{system}} on track when {{scenario}} disrupts the plan?",
      "Tell me about how you would execute {{skill}} when {{problem}} affects the normal flow of work.",
      "What does strong execution look like for {{skill}} under {{constraint}}?",
      "How do you make sure {{system}} keeps moving when {{scenario}} changes the original plan?",
      "Walk me through your approach to delivering {{skill}} when several moving parts need to stay aligned.",
    ],
    gold_standard: [
      "Walk me through how you keep execution disciplined when the plan changes but results still matter.",
      "What does good end-to-end ownership look like when you are responsible for delivering a complex piece of work?",
    ],
  },
  BEHAVIORAL: {
    templates: [
      "Tell me about a time when {{scenario}} and you had to decide how to respond.",
      "Walk me through what you did when {{problem}} started affecting the people around you.",
      "How have you handled situations where {{constraint}} created tension in the work?",
      "Tell me about a time when {{scenario}} forced you to balance speed, quality, and judgment.",
      "When {{problem}} created competing expectations, how did you decide what to do next?",
      "Describe a situation where {{scenario}} tested how you work with others under pressure.",
    ],
    gold_standard: [
      "Tell me about a time when the situation was unclear but your response shaped the outcome for others.",
      "Walk me through a situation where pressure was high and your judgment mattered as much as your execution.",
    ],
  },
  PRIORITIZATION: {
    templates: [
      "How do you decide what to do first when {{scenario}} creates competing priorities?",
      "When {{problem}} affects more than one commitment, what do you protect first and why?",
      "Walk me through how you would sequence the work when {{constraint}} makes everything feel urgent.",
      "How do you rebalance priorities when {{scenario}} changes the plan halfway through?",
      "What helps you decide the next move when {{problem}} affects both immediate needs and longer-term work?",
      "If {{constraint}} prevents you from doing everything at once, how do you make the trade-off?",
    ],
    gold_standard: [
      "How do you decide which priority sets the direction when every option has a meaningful cost?",
      "Walk me through how you protect the most important outcome when several urgent demands arrive at once.",
    ],
  },
  COORDINATION: {
    templates: [
      "How do you keep people aligned when {{scenario}} affects several parts of the work?",
      "Walk me through how you would coordinate {{system}} when {{problem}} depends on more than one team.",
      "What do you do first to bring the right people together when {{constraint}} creates confusion?",
      "How do you keep communication useful when {{scenario}} starts pulling people in different directions?",
      "When {{problem}} grows across teams, how do you keep accountability clear?",
      "How do you maintain trust while coordinating a response to {{scenario}} under pressure?",
    ],
    gold_standard: [
      "How do you keep cross-functional coordination moving when ownership is shared but urgency is high?",
      "Walk me through how you create clarity when several teams are involved and the situation is still changing.",
    ],
  },
  JUDGMENT: {
    templates: [
      "How do you make the call when {{scenario}} creates ambiguity and the right answer is not obvious?",
      "What factors do you weigh first when {{problem}} creates competing risks?",
      "Walk me through how you would frame the decision when {{constraint}} limits the cleanest option.",
      "How do you decide what risk is acceptable when {{scenario}} could have wider consequences?",
      "When {{problem}} affects both short-term outcomes and long-term trust, how do you make the call?",
      "How do you know you are making the right decision when {{scenario}} does not have a clear precedent?",
    ],
    gold_standard: [
      "How do you make a sound decision when the trade-offs are real and none of the options are perfect?",
      "Walk me through how you frame a judgment call when the consequences extend beyond the immediate issue.",
    ],
  },
  ANALYSIS: {
    templates: [
      "How do you turn {{artifact}} into a clear decision when {{scenario}} is unfolding?",
      "What do you look for in {{artifact}} when {{problem}} and {{constraint}} seem to point in different directions?",
      "Walk me through how you would interpret {{artifact}} before deciding what to do next.",
      "How do you decide what the data is really telling you about {{system}} when {{scenario}} is still unclear?",
      "When {{artifact}} gives mixed signals, how do you separate noise from what actually matters?",
      "How do you avoid overreacting to {{artifact}} when {{problem}} may have several causes?",
    ],
    gold_standard: [
      "How do you decide what matters in the data when the signals are mixed and the business still needs an answer?",
      "Walk me through how you move from analysis to action when the numbers support more than one interpretation.",
    ],
  },
}
