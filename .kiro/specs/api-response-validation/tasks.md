# API Response Validation - Tasks

## Phase 1: Database Schema

- [ ] Add `validations` JSONB column to monitors table
- [ ] Add `response_time_warning` column to monitors
- [ ] Add `response_time_critical` column to monitors
- [ ] Add `validation_results` JSONB column to heartbeats
- [ ] Update TypeScript types

## Phase 2: Validation Engine

- [ ] Create `lib/validators/index.ts` - validation orchestrator
- [ ] Create `lib/validators/status-code.ts` - status code validator
- [ ] Create `lib/validators/json-path.ts` - JSON path assertions
- [ ] Create `lib/validators/body-content.ts` - contains/regex validators
- [ ] Create `lib/validators/headers.ts` - header validators
- [ ] Create `lib/validators/response-time.ts` - threshold checker

## Phase 3: Integration

- [ ] Integrate validators into `lib/monitor-checker.ts`
- [ ] Update heartbeat creation with validation results
- [ ] Modify status determination logic for validation failures
- [ ] Add validation failure details to notifications

## Phase 4: UI - Configuration

- [ ] Create `components/validation-builder.tsx` - rule builder UI
- [ ] Create `components/json-path-input.tsx` - with autocomplete
- [ ] Add validation section to monitor create/edit form
- [ ] Add response time threshold inputs
- [ ] Implement validation rule preview/test

## Phase 5: UI - Results Display

- [ ] Show validation results in heartbeat details
- [ ] Add validation status indicators to monitor list
- [ ] Create validation failure timeline view
- [ ] Add validation metrics to monitor detail page

## Phase 6: Testing & Docs

- [ ] Unit tests for each validator
- [ ] Integration tests for validation flow
- [ ] Add validation examples to documentation
- [ ] Create validation rule templates/presets
