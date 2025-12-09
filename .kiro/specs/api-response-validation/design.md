# API Response Validation - Design

## Database Changes

### Monitor Table Additions

```sql
ALTER TABLE monitors ADD COLUMN validations JSONB DEFAULT '[]';
ALTER TABLE monitors ADD COLUMN response_time_warning INTEGER; -- ms
ALTER TABLE monitors ADD COLUMN response_time_critical INTEGER; -- ms
ALTER TABLE monitors ADD COLUMN expected_status_codes TEXT DEFAULT '2xx';
```

### Heartbeat Table Additions

```sql
ALTER TABLE heartbeats ADD COLUMN validation_results JSONB;
-- Structure: { passed: boolean, results: ValidationResult[] }
```

## Type Definitions

```typescript
// types/validation.ts

type ValidationType =
  | "status_code"
  | "json_path"
  | "body_contains"
  | "body_regex"
  | "header_exists"
  | "header_value"
  | "response_time";

interface ValidationRule {
  id: string;
  type: ValidationType;
  name: string;
  config: ValidationConfig;
  failureAction: "down" | "warning" | "log";
}

interface StatusCodeConfig {
  codes: string; // "200", "200-299", "2xx", "200,201,204"
  invert: boolean;
}

interface JsonPathConfig {
  path: string; // "$.data.status"
  operator: "equals" | "not_equals" | "contains" | "exists" | "gt" | "lt";
  value?: string | number | boolean;
}

interface BodyContainsConfig {
  text: string;
  caseSensitive: boolean;
  invert: boolean;
}

interface BodyRegexConfig {
  pattern: string;
  flags: string;
  invert: boolean;
}

interface HeaderConfig {
  name: string;
  value?: string;
  operator?: "equals" | "contains" | "exists";
}

interface ResponseTimeConfig {
  threshold: number;
  level: "warning" | "critical";
}

interface ValidationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  message: string;
  actual?: unknown;
  expected?: unknown;
}
```

## Validation Engine

```typescript
// lib/validators/index.ts

export async function validateResponse(
  response: {
    status: number;
    headers: Headers;
    body: string;
    responseTime: number;
  },
  rules: ValidationRule[],
): Promise<{ passed: boolean; results: ValidationResult[] }> {
  const results: ValidationResult[] = [];

  for (const rule of rules) {
    const result = await runValidator(rule, response);
    results.push(result);
  }

  const passed = results
    .filter((r) => r.failureAction === "down")
    .every((r) => r.passed);

  return { passed, results };
}
```

### JSON Path Validator

```typescript
// lib/validators/json-path.ts
import { JSONPath } from 'jsonpath-plus';

export function validateJsonPath(
  body: string,
  config: JsonPathConfig
): ValidationResult {
  try {
    const json = JSON.parse(body);
    const values = JSONPath({ path: config.path, json });

    if (config.operator === 'exists') {
      return { passed: values.length > 0, ... };
    }

    const actual = values[0];
    // Compare based on operator
  } catch (e) {
    return { passed: false, message: 'Invalid JSON response' };
  }
}
```

## Monitor Checker Integration

```typescript
// lib/monitor-checker.ts (modified)

async function checkHttpMonitor(monitor: Monitor): Promise<HeartbeatData> {
  const startTime = Date.now();
  const response = await fetch(monitor.url, { ... });
  const responseTime = Date.now() - startTime;
  const body = await response.text();

  // Run validations
  let validationResults = null;
  if (monitor.validations?.length > 0) {
    validationResults = await validateResponse(
      { status: response.status, headers: response.headers, body, responseTime },
      monitor.validations
    );
  }

  // Determine status
  const isUp = response.ok && (validationResults?.passed ?? true);

  return {
    status: isUp ? 1 : 0,
    ping: responseTime,
    msg: validationResults?.results.find(r => !r.passed)?.message || 'OK',
    validation_results: validationResults,
  };
}
```

## UI Components

### ValidationBuilder

```tsx
// components/validation-builder.tsx
"use client";

export function ValidationBuilder({
  rules,
  onChange,
}: {
  rules: ValidationRule[];
  onChange: (rules: ValidationRule[]) => void;
}) {
  return (
    <div className="space-y-4">
      {rules.map((rule) => (
        <ValidationRuleCard
          key={rule.id}
          rule={rule}
          onUpdate={(updated) => updateRule(rule.id, updated)}
          onDelete={() => deleteRule(rule.id)}
        />
      ))}
      <AddRuleButton onAdd={addRule} />
    </div>
  );
}
```

### Rule Type Selector

Dropdown with options:

- Status Code Check
- JSON Path Assertion
- Body Contains Text
- Body Matches Regex
- Header Exists
- Header Value Check

### JSON Path Input

- Text input with syntax highlighting
- Autocomplete for common paths
- Test button to validate against sample response
