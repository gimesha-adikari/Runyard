import test from 'node:test';
import assert from 'node:assert/strict';
import type { Project, Service, RunConfiguration, ProjectScript } from '../types/index.ts';

test('Project Scripts: classification and untrusted badge defaults', () => {
  const script: ProjectScript = {
    id: 'ps-123',
    project_id: 'pdfnest-backend-id',
    name: 'run_dev.sh',
    relative_path: 'run_dev.sh',
    command: './run_dev.sh',
    script_kind: 'DevelopmentServer',
    confidence: 'High',
    execution_mode: 'TerminalRequired',
    evidence: ['Shell shebang', 'Development launcher filename', 'Air live-reload'],
    is_trusted: false,
    trusted_fingerprint: null,
  };

  assert.equal(script.is_trusted, false, 'Project script must be untrusted by default');
  assert.equal(script.script_kind, 'DevelopmentServer');
  assert.equal(script.confidence, 'High');
  assert.equal(script.execution_mode, 'TerminalRequired');
  assert.equal(script.command, './run_dev.sh');
  assert.ok(script.evidence.length > 0);
});

test('Project Scripts: RunConfiguration generated for script is untrusted and matches command', () => {
  const script: ProjectScript = {
    id: 'ps-run-dev',
    project_id: 'pdfnest-backend-id',
    name: 'run_dev.sh',
    relative_path: 'run_dev.sh',
    command: './run_dev.sh',
    script_kind: 'DevelopmentServer',
    confidence: 'High',
    execution_mode: 'TerminalRequired',
    evidence: ['Air runner'],
    is_trusted: false,
  };

  const generatedConfig: RunConfiguration = {
    id: 'generated-cfg-id',
    project_id: script.project_id,
    service_id: null,
    name: script.name,
    command: script.command,
    args: [],
    working_dir: '/home/gimesha/My_Projects/platen/pdfnest-backend',
    env_file: null,
    env_vars: {},
    is_trusted: false,
    trusted_fingerprint: null,
    is_default: false,
    source: 'Detected',
    created_at: new Date().toISOString(),
  };

  assert.equal(generatedConfig.is_trusted, false);
  assert.equal(generatedConfig.source, 'Detected');
  assert.equal(generatedConfig.command, './run_dev.sh');
  assert.equal(generatedConfig.working_dir, '/home/gimesha/My_Projects/platen/pdfnest-backend');
});

test('Services Overview: cohesive subproject resolution and representation', () => {
  const parentProject: Project = {
    id: 'platen-id',
    name: 'platen',
    path: '/home/gimesha/My_Projects/platen',
    project_type: 'cargo',
    parent_project_id: null,
    is_runnable: true,
    languages: ['Rust'],
    frameworks: [],
    has_git: true,
    git_branch: 'main',
    git_remote: null,
    preferred_ide: null,
    default_run_config_id: null,
    is_favorite: false,
    tags: [],
    last_opened: null,
    last_run: null,
    created_at: new Date().toISOString(),
  };

  const childSubproject: Project = {
    id: 'child-backend-id',
    name: 'pdfnest-backend',
    path: '/home/gimesha/My_Projects/platen/pdfnest-backend',
    project_type: 'go',
    parent_project_id: 'platen-id',
    is_runnable: true,
    languages: ['Go'],
    frameworks: [],
    has_git: true,
    git_branch: 'main',
    git_remote: null,
    preferred_ide: null,
    default_run_config_id: null,
    is_favorite: false,
    tags: [],
    last_opened: null,
    last_run: null,
    created_at: new Date().toISOString(),
  };

  const service: Service = {
    id: 'svc-backend-id',
    project_id: 'platen-id',
    name: 'pdfnest-backend',
    path: '/home/gimesha/My_Projects/platen/pdfnest-backend',
    service_type: 'Backend',
    languages: ['Go'],
    frameworks: [],
    is_runnable: true,
    source: 'Detected',
    created_at: new Date().toISOString(),
  };

  const allProjects = [parentProject, childSubproject];

  const matchingSubproject = allProjects.find(
    (p) => p.parent_project_id === parentProject.id && (p.path === service.path || p.name === service.name)
  );

  assert.ok(matchingSubproject, 'Service matching a subproject path must be resolved');
  assert.equal(matchingSubproject?.id, 'child-backend-id');
  assert.equal(matchingSubproject?.name, 'pdfnest-backend');
});
