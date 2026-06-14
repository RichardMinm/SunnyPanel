#!/bin/bash
# Run a subset of test cases against the live Agent API
# Usage: bash tests/agent/run-live-tests.sh
# Requires: dev server running on localhost:3000

API="http://localhost:3000/api/agent/chat"
CASES_FILE="tests/agent-test-cases.json"
OUTPUT_FILE="tests/agent-live-results.txt"

# Representative subset: 1-2 per category
SUBSET_IDS=(
  "query-001" "query-010"
  "create-001" "create-003"
  "modify-001" "modify-005"
  "delete-001" "delete-006"
  "multi-001" "multi-004"
  "fuzzy-001" "fuzzy-003"
  "security-001" "security-002"
  "empty-001" "empty-004"
)

echo "════════════════════════════════════════════════════════" | tee "$OUTPUT_FILE"
echo "  SunnyPanel Agent Live Test Results" | tee -a "$OUTPUT_FILE"
echo "  $(date)" | tee -a "$OUTPUT_FILE"
echo "════════════════════════════════════════════════════════" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

for id in "${SUBSET_IDS[@]}"; do
  # Extract test case from JSON
  TC=$(python3 -c "
import json
with open('$CASES_FILE') as f:
    cases = json.load(f)
tc = next(c for c in cases if c['id'] == '$id')
print(json.dumps(tc, ensure_ascii=False))
" 2>/dev/null)

  if [ -z "$TC" ]; then
    echo "⚠️  Test case $id not found" | tee -a "$OUTPUT_FILE"
    continue
  fi

  DESC=$(echo "$TC" | python3 -c "import json,sys; print(json.load(sys.stdin)['description'])")
  INPUT=$(echo "$TC" | python3 -c "import json,sys; print(json.load(sys.stdin)['userInput'])")
  CATEGORY=$(echo "$TC" | python3 -c "import json,sys; print(json.load(sys.stdin)['category'])")

  echo "────────────────────────────────────────────────────────" | tee -a "$OUTPUT_FILE"
  echo "  [$CATEGORY] $id: $DESC" | tee -a "$OUTPUT_FILE"
  echo "  输入: $INPUT" | tee -a "$OUTPUT_FILE"
  echo "────────────────────────────────────────────────────────" | tee -a "$OUTPUT_FILE"
  echo "" | tee -a "$OUTPUT_FILE"

  # Send request and capture streaming response
  RESPONSE=$(curl -s -N -X POST "$API" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream" \
    -d "{
      \"message\": $(echo "$INPUT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),
      \"threadId\": null,
      \"workbenchMode\": \"ask\",
      \"stream\": true,
      \"messages\": []
    }" 2>&1)

  echo "  原始响应:" | tee -a "$OUTPUT_FILE"
  echo "$RESPONSE" | tee -a "$OUTPUT_FILE"
  echo "" | tee -a "$OUTPUT_FILE"
  echo "" | tee -a "$OUTPUT_FILE"

  # Brief pause between requests
  sleep 1
done

echo "════════════════════════════════════════════════════════" | tee -a "$OUTPUT_FILE"
echo "  测试完成，结果保存在 $OUTPUT_FILE" | tee -a "$OUTPUT_FILE"
echo "════════════════════════════════════════════════════════" | tee -a "$OUTPUT_FILE"
