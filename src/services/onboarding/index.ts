/**
 * Onboarding Service (System Design §2) — owns WelcomeDoc, IntakeForm,
 * IntakeResponse, AccessRequest. Talks to AIGateway and WhatsApp/Email.
 * Implements PRD §8 (Welcome Doc), §9 (Intake Form), §10 (Request for Access).
 *
 * Hard boundary (System Design §4): never store or transmit a raw client
 * credential. AccessRequest.instructions is generated text only.
 */
export {};
