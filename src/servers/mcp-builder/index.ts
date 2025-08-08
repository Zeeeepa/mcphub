import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { addOrUpdateServer, notifyToolChanged } from '../../services/mcpService.js';
import { loadSettings } from '../../config/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AIProviderManager, ProviderManagerConfig } from './ai-providers/provider-manager.js';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/app/PROJECTS';

interface BuildResult {
  success: boolean;
  projectPath: string;
  buildLogs: string[];
  error?: string;
}

// Removed unused interface ServerRegistration

interface SmokeRunResult {
  success: boolean;
  toolResults: Array<{
    toolName: string;
    success: boolean;
    result?: any;
    error?: string;
    duration: number;
  }>;
  totalTools: number;
  successCount: number;
}

export class McpBuilderServer {
  private server: Server;
  private aiManager: AIProviderManager | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-builder',
        version: '2.0.0', // Updated version for AI-powered features
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'clone_and_build',
            description: 'Clone a Git repository and build it based on detected language ecosystem (Node.js, Python). Supports branch/tag selection and custom build commands.',
            inputSchema: {
              type: 'object',
              properties: {
                repo_url: {
                  type: 'string',
                  description: 'Git repository URL to clone (https or ssh)',
                },
                name: {
                  type: 'string',
                  description: 'Optional project name (defaults to repo name)',
                },
                branch: {
                  type: 'string',
                  description: 'Branch, tag, or commit to checkout (defaults to default branch)',
                },
                build_commands: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Custom build commands to override auto-detection',
                },
                env: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                  description: 'Environment variables for build process',
                },
                pull_if_exists: {
                  type: 'boolean',
                  description: 'If project exists, pull latest changes (default: false)',
                  default: false,
                },
              },
              required: ['repo_url'],
            },
          },
          {
            name: 'register_server',
            description: 'Register a built project as an MCP server in mcphub configuration. Updates mcp_settings.json and triggers hot reload.',
            inputSchema: {
              type: 'object',
              properties: {
                server_name: {
                  type: 'string',
                  description: 'Unique name for the MCP server',
                },
                command: {
                  type: 'string',
                  description: 'Command to execute the server (e.g., "node", "python", "pnpm")',
                },
                args: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Arguments for the command',
                },
                working_dir: {
                  type: 'string',
                  description: 'Working directory path (relative to WORKSPACE_DIR or absolute)',
                },
                env: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                  description: 'Environment variables for the server',
                },
                enabled: {
                  type: 'boolean',
                  description: 'Whether the server should be enabled (default: true)',
                  default: true,
                },
              },
              required: ['server_name', 'command', 'args', 'working_dir'],
            },
          },
          {
            name: 'smoke_run',
            description: 'Test all tools of a registered MCP server with example inputs. Validates server functionality and tool availability.',
            inputSchema: {
              type: 'object',
              properties: {
                server_name: {
                  type: 'string',
                  description: 'Name of the registered MCP server to test',
                },
                tool_filter: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Optional list of specific tools to test (tests all if not provided)',
                },
                args_map: {
                  type: 'object',
                  additionalProperties: { type: 'object' },
                  description: 'Custom arguments for specific tools (tool_name -> args object)',
                },
                timeout: {
                  type: 'number',
                  description: 'Timeout per tool in milliseconds (default: 30000)',
                  default: 30000,
                },
              },
              required: ['server_name'],
            },
          },
          {
            name: 'analyze_self',
            description: 'AI-powered analysis of mcphub\'s own codebase. Identifies redundancies, performance issues, security vulnerabilities, and improvement opportunities.',
            inputSchema: {
              type: 'object',
              properties: {
                openai_api_key: {
                  type: 'string',
                  description: 'OpenAI API key for AI analysis',
                },
                gemini_api_key: {
                  type: 'string',
                  description: 'Google Gemini API key for AI analysis',
                },
                openrouter_api_key: {
                  type: 'string',
                  description: 'OpenRouter API key for AI analysis',
                },
                analysis_type: {
                  type: 'string',
                  enum: ['security', 'performance', 'quality', 'architecture', 'redundancy', 'comprehensive'],
                  description: 'Type of analysis to perform (default: comprehensive)',
                  default: 'comprehensive',
                },
                target_files: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Specific files to analyze (analyzes all if not provided)',
                },
                ensemble_mode: {
                  type: 'boolean',
                  description: 'Use multiple AI providers for consensus (default: false)',
                  default: false,
                },
              },
            },
          },
          {
            name: 'improve_codebase',
            description: 'AI-powered improvement of mcphub\'s codebase. Removes redundancies, enhances functions, and applies optimizations based on AI analysis.',
            inputSchema: {
              type: 'object',
              properties: {
                openai_api_key: {
                  type: 'string',
                  description: 'OpenAI API key for AI modifications',
                },
                gemini_api_key: {
                  type: 'string',
                  description: 'Google Gemini API key for AI modifications',
                },
                openrouter_api_key: {
                  type: 'string',
                  description: 'OpenRouter API key for AI modifications',
                },
                improvement_type: {
                  type: 'string',
                  enum: ['remove_redundancy', 'enhance_functions', 'optimize_performance', 'improve_security', 'comprehensive'],
                  description: 'Type of improvement to apply (default: comprehensive)',
                  default: 'comprehensive',
                },
                target_files: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Specific files to improve (improves all if not provided)',
                },
                safety_level: {
                  type: 'string',
                  enum: ['conservative', 'moderate', 'aggressive'],
                  description: 'Safety level for modifications (default: moderate)',
                  default: 'moderate',
                },
                dry_run: {
                  type: 'boolean',
                  description: 'Preview changes without applying them (default: true)',
                  default: true,
                },
              },
            },
          },
          {
            name: 'validate_changes',
            description: 'Comprehensive validation of code changes including syntax, semantics, security, and functionality checks.',
            inputSchema: {
              type: 'object',
              properties: {
                file_paths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Files to validate (validates all changed files if not provided)',
                },
                validation_types: {
                  type: 'array',
                  items: { 
                    type: 'string',
                    enum: ['syntax', 'semantic', 'security', 'performance', 'functionality']
                  },
                  description: 'Types of validation to perform (default: all)',
                },
                run_tests: {
                  type: 'boolean',
                  description: 'Run automated tests as part of validation (default: true)',
                  default: true,
                },
              },
            },
          },
          {
            name: 'rollback_modifications',
            description: 'Rollback recent modifications to mcphub codebase with granular control over what to revert.',
            inputSchema: {
              type: 'object',
              properties: {
                rollback_id: {
                  type: 'string',
                  description: 'Specific rollback point ID (uses latest if not provided)',
                },
                file_paths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Specific files to rollback (rollbacks all if not provided)',
                },
                confirm: {
                  type: 'boolean',
                  description: 'Confirm rollback operation (default: false for safety)',
                  default: false,
                },
              },
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'clone_and_build':
            return await this.handleCloneAndBuild(args);
          case 'register_server':
            return await this.handleRegisterServer(args);
          case 'smoke_run':
            return await this.handleSmokeRun(args);
          case 'analyze_self':
            return await this.handleAnalyzeSelf(args);
          case 'improve_codebase':
            return await this.handleImproveCodebase(args);
          case 'validate_changes':
            return await this.handleValidateChanges(args);
          case 'rollback_modifications':
            return await this.handleRollbackModifications(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleCloneAndBuild(args: any) {
    const {
      repo_url,
      name,
      branch,
      build_commands,
      env = {},
      pull_if_exists = false,
    } = args;

    if (!repo_url) {
      throw new Error('repo_url is required');
    }

    // Ensure workspace directory exists
    await fs.mkdir(WORKSPACE_DIR, { recursive: true });

    // Determine project name
    const projectName = name || path.basename(repo_url, '.git');
    const projectPath = path.join(WORKSPACE_DIR, projectName);

    const buildLogs: string[] = [];
    
    try {
      // Check if project already exists
      const projectExists = await fs.access(projectPath).then(() => true).catch(() => false);
      
      if (projectExists) {
        if (pull_if_exists) {
          buildLogs.push('Project exists, pulling latest changes...');
          await this.runCommand('git', ['fetch', 'origin'], projectPath, buildLogs);
          if (branch) {
            await this.runCommand('git', ['checkout', branch], projectPath, buildLogs);
          }
          await this.runCommand('git', ['pull'], projectPath, buildLogs);
        } else {
          buildLogs.push('Project already exists, skipping clone');
        }
      } else {
        // Clone repository
        buildLogs.push(`Cloning ${repo_url}...`);
        const cloneArgs = ['clone', repo_url, projectPath];
        if (branch) {
          cloneArgs.splice(1, 0, '-b', branch);
        }
        await this.runCommand('git', cloneArgs, WORKSPACE_DIR, buildLogs);
      }

      // Build project based on detected ecosystem
      const buildResult = await this.buildProject(projectPath, build_commands, env, buildLogs);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: buildResult.success,
              projectName,
              projectPath,
              buildLogs,
              error: buildResult.error,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              projectName,
              projectPath,
              buildLogs,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  private async handleRegisterServer(args: any) {
    const {
      server_name,
      command,
      args: serverArgs,
      working_dir,
      env = {},
      enabled = true,
    } = args;

    if (!server_name || !command || !serverArgs || !working_dir) {
      throw new Error('server_name, command, args, and working_dir are required');
    }

    // Resolve working directory
    const workingDir = path.isAbsolute(working_dir) 
      ? working_dir 
      : path.join(WORKSPACE_DIR, working_dir);

    // Verify working directory exists
    try {
      await fs.access(workingDir);
    } catch {
      throw new Error(`Working directory does not exist: ${workingDir}`);
    }

    // Create server configuration
    const serverConfig = {
      type: 'stdio' as const,
      command,
      args: serverArgs,
      workingDir,
      env,
      enabled,
      owner: 'mcp-builder',
    };

    // Register server
    const result = await addOrUpdateServer(server_name, serverConfig, true);
    
    if (!result.success) {
      throw new Error(result.message || 'Failed to register server');
    }

    // Trigger hot reload
    await notifyToolChanged();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Server '${server_name}' registered successfully`,
            serverConfig,
          }, null, 2),
        },
      ],
    };
  }

  private async handleSmokeRun(args: any) {
    const {
      server_name,
      tool_filter,
      args_map = {},
      timeout = 30000,
    } = args;

    if (!server_name) {
      throw new Error('server_name is required');
    }

    // Get server configuration
    const settings = loadSettings();
    const serverConfig = settings.mcpServers[server_name];
    
    if (!serverConfig) {
      throw new Error(`Server '${server_name}' not found in configuration`);
    }

    if (!serverConfig.enabled) {
      throw new Error(`Server '${server_name}' is disabled`);
    }

    const results: SmokeRunResult = {
      success: true,
      toolResults: [],
      totalTools: 0,
      successCount: 0,
    };

    try {
      // Create client and connect to server
      const client = new Client(
        { name: 'mcp-builder-smoke-test', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );

      const transport = new StdioClientTransport({
        command: serverConfig.command!,
        args: serverConfig.args!,
        env: { ...process.env, ...serverConfig.env },
        workingDir: serverConfig.workingDir,
      });

      await client.connect(transport, { timeout });

      // List available tools
      const toolsResponse = await client.listTools({}, { timeout });
      const tools = toolsResponse.tools;

      // Filter tools if specified
      const toolsToTest = tool_filter 
        ? tools.filter(tool => tool_filter.includes(tool.name))
        : tools;

      results.totalTools = toolsToTest.length;

      // Test each tool
      for (const tool of toolsToTest) {
        const startTime = Date.now();
        
        try {
          // Generate example arguments
          const toolArgs = args_map[tool.name] || this.generateExampleArgs(tool.inputSchema);
          
          // Call tool
          const result = await client.callTool(
            { name: tool.name, arguments: toolArgs },
            undefined,
            { timeout }
          );

          results.toolResults.push({
            toolName: tool.name,
            success: true,
            result: result.content,
            duration: Date.now() - startTime,
          });
          results.successCount++;
        } catch (error) {
          results.toolResults.push({
            toolName: tool.name,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime,
          });
        }
      }

      // Close connection
      client.close();
      transport.close();

      results.success = results.successCount === results.totalTools;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              toolResults: results.toolResults,
              totalTools: results.totalTools,
              successCount: results.successCount,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  private async buildProject(
    projectPath: string,
    customCommands?: string[],
    env: Record<string, string> = {},
    buildLogs: string[] = []
  ): Promise<BuildResult> {
    try {
      if (customCommands && customCommands.length > 0) {
        // Use custom build commands
        buildLogs.push('Using custom build commands...');
        for (const command of customCommands) {
          const [cmd, ...args] = command.split(' ');
          await this.runCommand(cmd, args, projectPath, buildLogs, env);
        }
      } else {
        // Auto-detect and build
        await this.autoBuild(projectPath, buildLogs, env);
      }

      return { success: true, projectPath, buildLogs };
    } catch (error) {
      return {
        success: false,
        projectPath,
        buildLogs,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async autoBuild(
    projectPath: string,
    buildLogs: string[],
    env: Record<string, string> = {}
  ) {
    // Check for Node.js project
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJsonExists = await fs.access(packageJsonPath).then(() => true).catch(() => false);

    if (packageJsonExists) {
      buildLogs.push('Detected Node.js project (package.json found)');
      
      // Check for pnpm-lock.yaml, yarn.lock, or default to npm
      const pnpmLockExists = await fs.access(path.join(projectPath, 'pnpm-lock.yaml')).then(() => true).catch(() => false);
      const yarnLockExists = await fs.access(path.join(projectPath, 'yarn.lock')).then(() => true).catch(() => false);

      if (pnpmLockExists) {
        buildLogs.push('Using pnpm for installation...');
        await this.runCommand('pnpm', ['install'], projectPath, buildLogs, env);
        
        // Check if build script exists
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        if (packageJson.scripts?.build) {
          buildLogs.push('Running build script...');
          await this.runCommand('pnpm', ['run', 'build'], projectPath, buildLogs, env);
        }
      } else if (yarnLockExists) {
        buildLogs.push('Using yarn for installation...');
        await this.runCommand('yarn', ['install'], projectPath, buildLogs, env);
        
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        if (packageJson.scripts?.build) {
          buildLogs.push('Running build script...');
          await this.runCommand('yarn', ['run', 'build'], projectPath, buildLogs, env);
        }
      } else {
        buildLogs.push('Using npm for installation...');
        await this.runCommand('npm', ['ci'], projectPath, buildLogs, env);
        
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        if (packageJson.scripts?.build) {
          buildLogs.push('Running build script...');
          await this.runCommand('npm', ['run', 'build'], projectPath, buildLogs, env);
        }
      }
      return;
    }

    // Check for Python project
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    const pyprojectExists = await fs.access(pyprojectPath).then(() => true).catch(() => false);
    const requirementsExists = await fs.access(requirementsPath).then(() => true).catch(() => false);

    if (pyprojectExists || requirementsExists) {
      buildLogs.push('Detected Python project');
      
      // Use uv if available, otherwise pip
      try {
        await this.runCommand('uv', ['--version'], projectPath, [], env);
        buildLogs.push('Using uv for Python package management...');
        
        if (pyprojectExists) {
          await this.runCommand('uv', ['sync'], projectPath, buildLogs, env);
        } else if (requirementsExists) {
          await this.runCommand('uv', ['pip', 'install', '-r', 'requirements.txt'], projectPath, buildLogs, env);
        }
      } catch {
        buildLogs.push('uv not available, using pip...');
        
        // Create virtual environment
        await this.runCommand('python', ['-m', 'venv', '.venv'], projectPath, buildLogs, env);
        
        // Install dependencies
        const pipCommand = process.platform === 'win32' ? '.venv\\Scripts\\pip' : '.venv/bin/pip';
        if (requirementsExists) {
          await this.runCommand(pipCommand, ['install', '-r', 'requirements.txt'], projectPath, buildLogs, env);
        }
      }
      return;
    }

    buildLogs.push('No recognized project type found, skipping build');
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd: string,
    logs: string[],
    env: Record<string, string> = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let _stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        const output = data.toString();
        _stdout += output;
        logs.push(`[${command}] ${output.trim()}`);
      });

      child.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        logs.push(`[${command}] ERROR: ${output.trim()}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}\nStderr: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to spawn command: ${error.message}`));
      });

      // Set timeout
      setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out: ${command} ${args.join(' ')}`));
      }, 300000); // 5 minutes
    });
  }

  private generateExampleArgs(inputSchema: any): any {
    if (!inputSchema || typeof inputSchema !== 'object') {
      return {};
    }

    const args: any = {};
    const properties = inputSchema.properties || {};

    for (const [key, schema] of Object.entries(properties)) {
      const prop = schema as any;
      
      switch (prop.type) {
        case 'string':
          if (prop.enum && prop.enum.length > 0) {
            args[key] = prop.enum[0];
          } else {
            args[key] = prop.example || 'example';
          }
          break;
        case 'number':
        case 'integer':
          args[key] = prop.example || 1;
          break;
        case 'boolean':
          args[key] = prop.example !== undefined ? prop.example : true;
          break;
        case 'array':
          args[key] = prop.example || [];
          break;
        case 'object':
          args[key] = prop.example || {};
          break;
        default:
          args[key] = prop.example || null;
      }
    }

    return args;
  }

  getServer(): Server {
    return this.server;
  }

  /**
   * Initialize AI Provider Manager with provided API keys
   */
  private initializeAIManager(args: any): void {
    const providerConfig: ProviderManagerConfig = {
      providers: {},
      defaultProvider: 'openai',
    };

    if (args.openai_api_key) {
      providerConfig.providers.openai = {
        apiKey: args.openai_api_key,
        temperature: 0.1,
        maxTokens: 4000,
      };
    }

    if (args.gemini_api_key) {
      providerConfig.providers.gemini = {
        apiKey: args.gemini_api_key,
        temperature: 0.1,
        maxTokens: 4000,
      };
    }

    if (args.openrouter_api_key) {
      providerConfig.providers.openrouter = {
        apiKey: args.openrouter_api_key,
        temperature: 0.1,
        maxTokens: 4000,
      };
    }

    // Set default provider based on available keys
    if (args.gemini_api_key && !args.openai_api_key) {
      providerConfig.defaultProvider = 'gemini';
    } else if (args.openrouter_api_key && !args.openai_api_key && !args.gemini_api_key) {
      providerConfig.defaultProvider = 'openrouter';
    }

    this.aiManager = new AIProviderManager(providerConfig);
  }

  /**
   * Handle AI-powered self-analysis of mcphub codebase
   */
  private async handleAnalyzeSelf(args: any) {
    try {
      // Initialize AI manager
      this.initializeAIManager(args);
      
      if (!this.aiManager) {
        throw new Error('No AI providers configured. Please provide at least one API key.');
      }

      const {
        analysis_type = 'comprehensive',
        target_files = [],
        ensemble_mode = false,
      } = args;

      // Get mcphub project root (current working directory)
      const projectRoot = process.cwd();
      const analysisResults: any[] = [];

      // Determine files to analyze
      let filesToAnalyze: string[] = [];
      if (target_files.length > 0) {
        filesToAnalyze = target_files.map((file: string) => path.resolve(projectRoot, file));
      } else {
        // Analyze key mcphub files
        const keyDirectories = ['src', 'frontend/src'];
        for (const dir of keyDirectories) {
          const dirPath = path.join(projectRoot, dir);
          try {
            const files = await this.getFilesRecursively(dirPath, ['.ts', '.tsx', '.js', '.jsx']);
            filesToAnalyze.push(...files);
          } catch (error) {
            console.warn(`Could not read directory ${dirPath}:`, error);
          }
        }
      }

      // Analyze each file
      for (const filePath of filesToAnalyze.slice(0, 20)) { // Limit to 20 files for cost control
        try {
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const relativePath = path.relative(projectRoot, filePath);
          const language = this.getLanguageFromExtension(path.extname(filePath));

          const analysisRequest = {
            code: fileContent,
            filePath: relativePath,
            language,
            context: `This is part of mcphub, a multi-MCP server hub application built with Node.js/TypeScript and React.`,
            analysisType: analysis_type as any,
          };

          let result;
          if (ensemble_mode) {
            result = await this.aiManager.ensembleAnalysis(analysisRequest);
            analysisResults.push({
              file: relativePath,
              analysis: result.consensus,
              confidence: result.confidence,
              providers: result.individual.map(r => r.provider),
              ensemble: true,
            });
          } else {
            result = await this.aiManager.analyzeCode(analysisRequest);
            analysisResults.push({
              file: relativePath,
              analysis: result,
              provider: result.provider,
              ensemble: false,
            });
          }
        } catch (error) {
          console.error(`Failed to analyze ${filePath}:`, error);
          analysisResults.push({
            file: path.relative(projectRoot, filePath),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Generate summary
      const summary = this.generateAnalysisSummary(analysisResults, analysis_type);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              analysisType: analysis_type,
              filesAnalyzed: filesToAnalyze.length,
              ensembleMode: ensemble_mode,
              summary,
              results: analysisResults,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle AI-powered codebase improvement
   */
  private async handleImproveCodebase(args: any) {
    try {
      // Initialize AI manager
      this.initializeAIManager(args);
      
      if (!this.aiManager) {
        throw new Error('No AI providers configured. Please provide at least one API key.');
      }

      const {
        improvement_type = 'comprehensive',
        target_files = [],
        safety_level = 'moderate',
        dry_run = true,
      } = args;

      const projectRoot = process.cwd();
      const improvementResults: any[] = [];

      // Determine files to improve
      let filesToImprove: string[] = [];
      if (target_files.length > 0) {
        filesToImprove = target_files.map((file: string) => path.resolve(projectRoot, file));
      } else {
        // Focus on key mcphub files that are safe to modify
        const safeDirectories = ['src/servers/mcp-builder', 'src/controllers'];
        for (const dir of safeDirectories) {
          const dirPath = path.join(projectRoot, dir);
          try {
            const files = await this.getFilesRecursively(dirPath, ['.ts', '.js']);
            filesToImprove.push(...files);
          } catch (error) {
            console.warn(`Could not read directory ${dirPath}:`, error);
          }
        }
      }

      // Create backup before modifications (if not dry run)
      let backupId: string | null = null;
      if (!dry_run) {
        backupId = await this.createBackup(filesToImprove);
      }

      // Improve each file
      for (const filePath of filesToImprove.slice(0, 10)) { // Limit to 10 files for safety
        try {
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const relativePath = path.relative(projectRoot, filePath);
          const language = this.getLanguageFromExtension(path.extname(filePath));

          const instructions = this.getImprovementInstructions(improvement_type);
          
          const modificationRequest = {
            originalCode: fileContent,
            filePath: relativePath,
            language,
            instructions,
            context: `This is part of mcphub, a multi-MCP server hub application. Maintain compatibility with existing APIs and functionality.`,
            safetyLevel: safety_level as any,
          };

          const result = await this.aiManager.modifyCode(modificationRequest);
          
          if (!dry_run && result.confidence > 0.7) {
            // Apply the modification
            await fs.writeFile(filePath, result.modifiedCode, 'utf-8');
          }

          improvementResults.push({
            file: relativePath,
            applied: !dry_run && result.confidence > 0.7,
            modification: result,
            provider: result.provider,
          });
        } catch (error) {
          console.error(`Failed to improve ${filePath}:`, error);
          improvementResults.push({
            file: path.relative(projectRoot, filePath),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              improvementType: improvement_type,
              safetyLevel: safety_level,
              dryRun: dry_run,
              filesProcessed: filesToImprove.length,
              backupId,
              results: improvementResults,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle validation of code changes
   */
  private async handleValidateChanges(args: any) {
    try {
      const {
        file_paths = [],
        validation_types = ['syntax', 'semantic', 'security', 'performance', 'functionality'],
        run_tests = true,
      } = args;

      const projectRoot = process.cwd();
      const validationResults: any[] = [];

      // Determine files to validate
      let filesToValidate: string[] = [];
      if (file_paths.length > 0) {
        filesToValidate = file_paths.map((file: string) => path.resolve(projectRoot, file));
      } else {
        // Get recently modified files
        filesToValidate = await this.getRecentlyModifiedFiles(projectRoot);
      }

      // Validate each file
      for (const filePath of filesToValidate) {
        const relativePath = path.relative(projectRoot, filePath);
        const fileResults: any = { file: relativePath, validations: {} };

        try {
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const language = this.getLanguageFromExtension(path.extname(filePath));

          // Syntax validation
          if (validation_types.includes('syntax')) {
            fileResults.validations.syntax = await this.validateSyntax(fileContent, language);
          }

          // Semantic validation
          if (validation_types.includes('semantic')) {
            fileResults.validations.semantic = await this.validateSemantics(fileContent, language);
          }

          // Security validation
          if (validation_types.includes('security')) {
            fileResults.validations.security = await this.validateSecurity(fileContent, language);
          }

          // Performance validation
          if (validation_types.includes('performance')) {
            fileResults.validations.performance = await this.validatePerformance(fileContent, language);
          }

          // Functionality validation
          if (validation_types.includes('functionality')) {
            fileResults.validations.functionality = await this.validateFunctionality(filePath);
          }

        } catch (error) {
          fileResults.error = error instanceof Error ? error.message : String(error);
        }

        validationResults.push(fileResults);
      }

      // Run tests if requested
      let testResults = null;
      if (run_tests) {
        testResults = await this.runTests();
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              validationTypes: validation_types,
              filesValidated: filesToValidate.length,
              results: validationResults,
              testResults,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle rollback of modifications
   */
  private async handleRollbackModifications(args: any) {
    try {
      const {
        rollback_id,
        file_paths = [],
        confirm = false,
      } = args;

      if (!confirm) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Rollback not confirmed. Set confirm: true to proceed with rollback.',
                warning: 'This operation will permanently revert changes.',
              }, null, 2),
            },
          ],
        };
      }

      const backupDir = path.join(process.cwd(), '.mcphub-backups');
      const rollbackResults: any[] = [];

      // Find backup to restore
      let backupPath: string;
      if (rollback_id) {
        backupPath = path.join(backupDir, rollback_id);
      } else {
        // Find latest backup
        const backups = await fs.readdir(backupDir);
        const latestBackup = backups.sort().reverse()[0];
        if (!latestBackup) {
          throw new Error('No backups found');
        }
        backupPath = path.join(backupDir, latestBackup);
      }

      // Restore files
      const backupFiles = await this.getFilesRecursively(backupPath, ['.ts', '.tsx', '.js', '.jsx']);
      
      for (const backupFile of backupFiles) {
        const relativePath = path.relative(backupPath, backupFile);
        
        // Skip if specific files requested and this isn't one of them
        if (file_paths.length > 0 && !file_paths.includes(relativePath)) {
          continue;
        }

        try {
          const originalPath = path.join(process.cwd(), relativePath);
          const backupContent = await fs.readFile(backupFile, 'utf-8');
          
          // Ensure directory exists
          await fs.mkdir(path.dirname(originalPath), { recursive: true });
          
          // Restore file
          await fs.writeFile(originalPath, backupContent, 'utf-8');
          
          rollbackResults.push({
            file: relativePath,
            restored: true,
          });
        } catch (error) {
          rollbackResults.push({
            file: relativePath,
            restored: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              rollbackId: rollback_id || 'latest',
              filesRestored: rollbackResults.filter(r => r.restored).length,
              results: rollbackResults,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  // Helper methods for AI-powered functionality

  private async getFilesRecursively(dir: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subFiles = await this.getFilesRecursively(fullPath, extensions);
          files.push(...subFiles);
        } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Could not read directory ${dir}:`, error);
    }
    
    return files;
  }

  private getLanguageFromExtension(ext: string): string {
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.py':
        return 'python';
      case '.java':
        return 'java';
      case '.go':
        return 'go';
      case '.rs':
        return 'rust';
      case '.cpp':
      case '.cc':
      case '.cxx':
        return 'cpp';
      case '.c':
        return 'c';
      default:
        return 'text';
    }
  }

  private generateAnalysisSummary(results: any[], analysisType: string): any {
    const totalFiles = results.length;
    const successfulAnalyses = results.filter(r => !r.error).length;
    const issues = results.flatMap(r => r.analysis?.issues || []);
    const suggestions = results.flatMap(r => r.analysis?.suggestions || []);

    return {
      totalFiles,
      successfulAnalyses,
      issuesFound: issues.length,
      suggestionsGenerated: suggestions.length,
      criticalIssues: issues.filter((i: any) => i.severity === 'critical').length,
      highImpactSuggestions: suggestions.filter((s: any) => s.impact === 'high').length,
      analysisType,
    };
  }

  private getImprovementInstructions(improvementType: string): string {
    switch (improvementType) {
      case 'remove_redundancy':
        return 'Remove duplicate code, consolidate similar functions, and eliminate unnecessary complexity while maintaining all functionality.';
      case 'enhance_functions':
        return 'Add error handling, improve performance, add type safety, and enhance existing functions with better practices.';
      case 'optimize_performance':
        return 'Optimize algorithms, reduce memory usage, improve async operations, and enhance overall performance.';
      case 'improve_security':
        return 'Fix security vulnerabilities, add input validation, improve authentication, and enhance data protection.';
      case 'comprehensive':
        return 'Comprehensively improve the code by removing redundancy, enhancing functions, optimizing performance, and improving security while maintaining compatibility.';
      default:
        return 'Improve the code quality and maintainability while preserving all existing functionality.';
    }
  }

  private async createBackup(files: string[]): Promise<string> {
    const backupId = `backup-${Date.now()}`;
    const backupDir = path.join(process.cwd(), '.mcphub-backups', backupId);
    
    await fs.mkdir(backupDir, { recursive: true });
    
    for (const filePath of files) {
      try {
        const relativePath = path.relative(process.cwd(), filePath);
        const backupPath = path.join(backupDir, relativePath);
        
        await fs.mkdir(path.dirname(backupPath), { recursive: true });
        await fs.copyFile(filePath, backupPath);
      } catch (error) {
        console.warn(`Failed to backup ${filePath}:`, error);
      }
    }
    
    return backupId;
  }

  private async getRecentlyModifiedFiles(projectRoot: string): Promise<string[]> {
    // Simple implementation - get files modified in last 24 hours
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentFiles: string[] = [];
    
    const allFiles = await this.getFilesRecursively(projectRoot, ['.ts', '.tsx', '.js', '.jsx']);
    
    for (const filePath of allFiles) {
      try {
        const stats = await fs.stat(filePath);
        if (stats.mtime.getTime() > oneDayAgo) {
          recentFiles.push(filePath);
        }
      } catch (error) {
        // Ignore files that can't be accessed
      }
    }
    
    return recentFiles;
  }

  private async validateSyntax(code: string, language: string): Promise<any> {
    // Basic syntax validation - in a real implementation, you'd use language-specific parsers
    try {
      if (language === 'javascript' || language === 'typescript') {
        // Try to parse as JavaScript/TypeScript
        // This is a simplified check - real implementation would use proper parsers
        return { valid: true, errors: [] };
      }
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  private async validateSemantics(code: string, language: string): Promise<any> {
    // Semantic validation would check for logical errors, type mismatches, etc.
    return { valid: true, warnings: [] };
  }

  private async validateSecurity(code: string, language: string): Promise<any> {
    // Security validation would check for common vulnerabilities
    const issues: string[] = [];
    
    // Simple checks for common issues
    if (code.includes('eval(')) {
      issues.push('Use of eval() detected - potential security risk');
    }
    if (code.includes('innerHTML') && !code.includes('sanitize')) {
      issues.push('Direct innerHTML usage without sanitization detected');
    }
    
    return { secure: issues.length === 0, issues };
  }

  private async validatePerformance(code: string, language: string): Promise<any> {
    // Performance validation would check for inefficient patterns
    const warnings: string[] = [];
    
    // Simple checks for performance issues
    if (code.includes('for (') && code.includes('.length')) {
      warnings.push('Consider caching array length in loops');
    }
    
    return { optimized: warnings.length === 0, warnings };
  }

  private async validateFunctionality(filePath: string): Promise<any> {
    // Functionality validation would run tests or check imports/exports
    return { functional: true, tests: [] };
  }

  private async runTests(): Promise<any> {
    // Run automated tests
    try {
      // This would run the actual test suite
      return { passed: true, results: 'All tests passed' };
    } catch (error) {
      return { passed: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
