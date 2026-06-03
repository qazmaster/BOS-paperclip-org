#!/usr/bin/env node
/**
 * M012-S03: Validate Local Seven Division Flow Artifact
 *
 * Validates the local seven-division flow artifact for:
 * 1. Files exist (JSON and Markdown)
 * 2. No plaintext secrets in JSON or markdown
 * 3. No Hermes/GSD-Pi/plugin runtime execution claimed
 * 4. All seven divisions represented
 * 5. Division flow sequence is correct
 * 6. All phases marked local_execution=true
 * 7. Fallback-only surfaces recorded with blocker codes
 * 8. Safety flags correctly set
 * 9. Schema structure is valid
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'runtime-evidence', 'M012-S03-local-seven-division-flow.json');
const MD_PATH = path.join(ROOT, 'runtime-evidence', 'M012-S03-local-seven-division-flow.md');

const EXPECTED_DIVISIONS = [
  'Div7.MissionControl',
  'Div1.HCO',
  'Div2.MasterPlanner',
  'Div3.Treasury',
  'Div4.Production',
  'Div5.QualificationsLibraryLearning'
];

const FALLBACK_SURFACES = [
  'plugin.host_registration',
  'plugin.piko_tools',
  'runtime.hermes_xiaomi_execution',
  'runtime.gsdpi_execution',
  'workflow.pr_merge_ci'
];

const SECRET_RE = /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._-]{10,}|pcp_[A-Za-z0-9_-]{16,}|paperclip_(?:key|token)_[A-Za-z0-9_-]{12,})/;

function fail(message) {
  console.error(`FAIL: ${message}`);
  return false;
}

function pass(message) {
  console.log(`PASS: ${message}`);
  return true;
}

function validate() {
  let allPassed = true;

  // 1. Files exist
  if (!fs.existsSync(JSON_PATH)) {
    fail(`JSON artifact not found: ${JSON_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(MD_PATH)) {
    fail(`Markdown artifact not found: ${MD_PATH}`);
    process.exit(1);
  }
  pass('Both JSON and Markdown artifacts exist');

  const jsonText = fs.readFileSync(JSON_PATH, 'utf8');
  const mdText = fs.readFileSync(MD_PATH, 'utf8');

  let artifact;
  try {
    artifact = JSON.parse(jsonText);
  } catch (err) {
    fail(`JSON artifact is malformed: ${err.message}`);
    process.exit(1);
  }
  pass('JSON artifact is valid JSON');

  // 2. No plaintext secrets
  if (SECRET_RE.test(jsonText)) {
    allPassed = fail('Plaintext secret pattern detected in JSON artifact') && allPassed;
  } else {
    pass('No plaintext secrets in JSON artifact');
  }

  if (SECRET_RE.test(mdText)) {
    allPassed = fail('Plaintext secret pattern detected in markdown artifact') && allPassed;
  } else {
    pass('No plaintext secrets in markdown artifact');
  }

  // 3. No Hermes/GSD-Pi/plugin runtime execution claimed
  if (artifact.execution_mode) {
    if (artifact.execution_mode.hermes_execution_attempted !== false) {
      allPassed = fail('hermes_execution_attempted is not false') && allPassed;
    } else {
      pass('hermes_execution_attempted is false');
    }

    if (artifact.execution_mode.gsdpi_execution_attempted !== false) {
      allPassed = fail('gsdpi_execution_attempted is not false') && allPassed;
    } else {
      pass('gsdpi_execution_attempted is false');
    }

    if (artifact.execution_mode.plugin_runtime_execution_attempted !== false) {
      allPassed = fail('plugin_runtime_execution_attempted is not false') && allPassed;
    } else {
      pass('plugin_runtime_execution_attempted is false');
    }

    if (artifact.execution_mode.local_only !== true) {
      allPassed = fail('local_only is not true') && allPassed;
    } else {
      pass('local_only is true');
    }
  } else {
    allPassed = fail('Missing execution_mode block') && allPassed;
  }

  // 4. All seven divisions represented
  if (!Array.isArray(artifact.division_flow)) {
    allPassed = fail('division_flow is not an array') && allPassed;
  } else {
    const divisionIds = artifact.division_flow.map(d => d.division_id);
    for (const expected of EXPECTED_DIVISIONS) {
      if (!divisionIds.includes(expected)) {
        allPassed = fail(`Missing division: ${expected}`) && allPassed;
      } else {
        pass(`Division present: ${expected}`);
      }
    }
    if (artifact.division_flow.length !== EXPECTED_DIVISIONS.length) {
      allPassed = fail(`Expected ${EXPECTED_DIVISIONS.length} divisions, got ${artifact.division_flow.length}`) && allPassed;
    } else {
      pass(`Correct number of divisions: ${EXPECTED_DIVISIONS.length}`);
    }
  }

  // 5. Division flow sequence is correct
  if (Array.isArray(artifact.division_flow) && artifact.division_flow.length === EXPECTED_DIVISIONS.length) {
    const expectedSequence = [
      'Div7.MissionControl',
      'Div1.HCO',
      'Div2.MasterPlanner',
      'Div3.Treasury',
      'Div4.Production',
      'Div5.QualificationsLibraryLearning'
    ];
    const actualSequence = artifact.division_flow.map(d => d.division_id);
    const sequenceCorrect = JSON.stringify(actualSequence) === JSON.stringify(expectedSequence);
    if (!sequenceCorrect) {
      allPassed = fail(`Division sequence incorrect. Expected: ${expectedSequence.join(' -> ')}. Got: ${actualSequence.join(' -> ')}`) && allPassed;
    } else {
      pass('Division flow sequence is correct: Div7 -> Div1 -> Div2 -> Div3 -> Div4 -> Div5');
    }
  }

  // 6. All phases marked local_execution=true
  if (Array.isArray(artifact.division_flow)) {
    let allLocal = true;
    for (const phase of artifact.division_flow) {
      if (phase.local_execution !== true) {
        allPassed = fail(`Phase ${phase.phase_id} (${phase.division_id}) has local_execution=${phase.local_execution}`) && allPassed;
        allLocal = false;
      }
    }
    if (allLocal) {
      pass('All phases marked local_execution=true');
    }
  }

  // 7. Fallback-only surfaces recorded with blocker codes
  if (!Array.isArray(artifact.fallback_only_surfaces)) {
    allPassed = fail('fallback_only_surfaces is not an array') && allPassed;
  } else {
    const surfaceIds = artifact.fallback_only_surfaces.map(s => s.surface);
    for (const expected of FALLBACK_SURFACES) {
      if (!surfaceIds.includes(expected)) {
        allPassed = fail(`Missing fallback-only surface: ${expected}`) && allPassed;
      } else {
        pass(`Fallback-only surface recorded: ${expected}`);
      }
    }
    // Check each has a blocker_code
    for (const surface of artifact.fallback_only_surfaces) {
      if (!surface.blocker_code) {
        allPassed = fail(`Fallback surface ${surface.surface} missing blocker_code`) && allPassed;
      } else {
        pass(`Fallback surface ${surface.surface} has blocker_code: ${surface.blocker_code}`);
      }
    }
  }

  // 8. Safety flags correctly set
  if (artifact.invariants) {
    const requiredInvariants = [
      'hermes_execution_attempted',
      'gsdpi_execution_attempted',
      'plugin_runtime_execution_attempted',
      'live_paperclip_mutation',
      'external_network_access',
      'direct_db_mutation',
      'plaintext_secrets_logged',
      'all_phases_local_only',
      'all_seven_divisions_represented'
    ];
    for (const inv of requiredInvariants) {
      if (!(inv in artifact.invariants)) {
        allPassed = fail(`Missing invariant: ${inv}`) && allPassed;
      } else {
        pass(`Invariant present: ${inv} = ${artifact.invariants[inv]}`);
      }
    }
    // Check boolean false for execution flags
    const mustBeFalse = [
      'hermes_execution_attempted',
      'gsdpi_execution_attempted',
      'plugin_runtime_execution_attempted',
      'live_paperclip_mutation',
      'external_network_access',
      'direct_db_mutation',
      'plaintext_secrets_logged'
    ];
    for (const flag of mustBeFalse) {
      if (artifact.invariants[flag] !== false) {
        allPassed = fail(`Invariant ${flag} is not false: ${artifact.invariants[flag]}`) && allPassed;
      }
    }
    // Check boolean true for correctness flags
    const mustBeTrue = ['all_phases_local_only', 'all_seven_divisions_represented'];
    for (const flag of mustBeTrue) {
      if (artifact.invariants[flag] !== true) {
        allPassed = fail(`Invariant ${flag} is not true: ${artifact.invariants[flag]}`) && allPassed;
      }
    }
    pass('Safety invariants validated');
  } else {
    allPassed = fail('Missing invariants block') && allPassed;
  }

  // 9. Schema structure is valid
  const requiredFields = [
    'schema_version',
    'artifact_type',
    'phase',
    'task',
    'description',
    'generated_at',
    'input_source',
    'execution_mode',
    'mission_anchor',
    'division_flow',
    'fallback_only_surfaces',
    'invariants',
    'validation'
  ];
  for (const field of requiredFields) {
    if (!(field in artifact)) {
      allPassed = fail(`Missing required field: ${field}`) && allPassed;
    } else {
      pass(`Required field present: ${field}`);
    }
  }

  // 10. Mission anchor structure
  if (artifact.mission_anchor) {
    const anchorFields = ['mission_id', 'mission_title', 'mission_posture', 'cynefin_domain', 'recommended_mode', 'source_gate'];
    for (const field of anchorFields) {
      if (!(field in artifact.mission_anchor)) {
        allPassed = fail(`Missing mission_anchor field: ${field}`) && allPassed;
      } else {
        pass(`mission_anchor.${field} present`);
      }
    }
    if (artifact.mission_anchor.cynefin_domain !== 'COMPLEX') {
      allPassed = fail(`cynefin_domain is not COMPLEX: ${artifact.mission_anchor.cynefin_domain}`) && allPassed;
    } else {
      pass('cynefin_domain is COMPLEX');
    }
  } else {
    allPassed = fail('Missing mission_anchor block') && allPassed;
  }

  // 11. Div7 emits DecisionDelegated to Div1
  if (Array.isArray(artifact.division_flow)) {
    const div7 = artifact.division_flow.find(d => d.division_id === 'Div7.MissionControl');
    if (div7 && div7.output && div7.output.type === 'DecisionDelegated') {
      pass('Div7 emits DecisionDelegated packet');
    } else {
      allPassed = fail('Div7 does not emit DecisionDelegated packet') && allPassed;
    }

    // Check Div1 receives from Div7
    const div1 = artifact.division_flow.find(d => d.division_id === 'Div1.HCO');
    if (div1 && div1.input && div1.input.source === 'Div7.MissionControl') {
      pass('Div1 receives input from Div7.MissionControl');
    } else {
      allPassed = fail('Div1 does not receive input from Div7.MissionControl') && allPassed;
    }
  }

  // 12. Div3 grant policy results in allow-with-constraints
  if (Array.isArray(artifact.division_flow)) {
    const div3 = artifact.division_flow.find(d => d.division_id === 'Div3.Treasury');
    if (div3 && div3.output && div3.output.grant_decision === 'allow-with-constraints') {
      pass('Div3 grant policy is allow-with-constraints');
    } else {
      allPassed = fail('Div3 grant policy is not allow-with-constraints') && allPassed;
    }
  }

  // 13. Div5 QA verdict is pass-with-conditions
  if (Array.isArray(artifact.division_flow)) {
    const div5 = artifact.division_flow.find(d => d.division_id === 'Div5.QualificationsLibraryLearning');
    if (div5 && div5.output && div5.output.verdict === 'pass-with-conditions') {
      pass('Div5 QA verdict is pass-with-conditions');
    } else {
      allPassed = fail('Div5 QA verdict is not pass-with-conditions') && allPassed;
    }
  }

  // 14. Markdown artifact mentions local-only
  if (!mdText.includes('Local-only') && !mdText.includes('local-only') && !mdText.includes('local_execution')) {
    allPassed = fail('Markdown artifact does not mention local-only execution') && allPassed;
  } else {
    pass('Markdown artifact mentions local-only execution');
  }

  // 15. Markdown artifact mentions no Hermes/GSD-Pi
  if (!mdText.includes('No Hermes') && !mdText.includes('no Hermes')) {
    allPassed = fail('Markdown artifact does not disclaim Hermes execution') && allPassed;
  } else {
    pass('Markdown artifact disclaims Hermes execution');
  }

  console.log('');
  console.log(allPassed ? '=== ALL CHECKS PASSED ===' : '=== SOME CHECKS FAILED ===');
  process.exit(allPassed ? 0 : 1);
}

validate();
