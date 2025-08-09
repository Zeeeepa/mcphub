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

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/app/PROJECTS';

interface BuildResult {
  success: boolean;
  projectPath: string;
  buildLogs: string[];
  error?: string;
}

interface ServerRegistration {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  workingDir: string;
  type: 'stdio';
}

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

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-builder',
        version: '1.0.0',
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

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
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
}
