# API Response Validation

## Overview

Extend HTTP monitors to validate response content beyond status codes, including JSON schema validation, response body assertions, and header checks.

## Requirements

### Functional Requirements

1. **Status Code Validation**
   - Accept single code or range (200, 200-299, 2xx)
   - Multiple acceptable codes (200, 201, 204)
   - Invert logic option (fail if matches)

2. **Response Body Validation**
   - JSON path assertions ($.data.status == "active")
   - Contains/not contains text
   - Regex pattern matching
   - JSON schema validation (optional)

3. **Header Validation**
   - Check header existence
   - Header value assertions
   - Content-Type validation

4. **Response Time Thresholds**
   - Warning threshold (e.g., >500ms)
   - Critical threshold (e.g., >2000ms)
   - Separate from down status

5. **Validation Results**
   - Store which validations passed/failed
   - Include in heartbeat message
   - Detailed failure reasons in incident

### Non-Functional Requirements

- Validation adds <50ms to check time
- JSON schema validation limited to 100KB responses
- Max 10 validation rules per monitor

## User Stories

- As a user, I want to verify my API returns expected JSON structure
- As a user, I want alerts when response time exceeds thresholds
- As a user, I want to check that specific headers are present

## Out of Scope

- GraphQL query validation
- XML/SOAP validation
- Response body transformation
