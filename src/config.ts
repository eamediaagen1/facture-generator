/**
 * Feature Flags
 * ============
 *
 * ENABLE_AI_DOCUMENT_CREATION: Allow users to create documents via AI prompts
 *   - Adds "Create with AI" button to invoice list
 *   - Shows modal for document type selection and client linking
 *   - Set to false to disable and remove all AI features
 *
 * ENABLE_SEND_MAIL: Allow users to send documents via email with PDF attachment
 *   - Adds "Send Mail" button to document rows
 *   - Shows modal for recipient selection and email preview
 *   - SMTP credentials must be set in environment variables
 *   - Set to false to disable and remove email sending feature
 *
 * To disable: Change flag to false
 * Effect: Button hidden, modal not mounted, existing flows unchanged
 */

export const ENABLE_AI_DOCUMENT_CREATION = true;
export const ENABLE_SEND_MAIL = true;
