import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Github, Download, AlertCircle } from 'lucide-react';
import { apiPost } from '@/utils/fetchInterceptor';
import { useToast } from '@/contexts/ToastContext';

interface GitHubInstallDialogProps {
  onInstall: () => void;
  onClose: () => void;
}

const GitHubInstallDialog: React.FC<GitHubInstallDialogProps> = ({ onInstall, onClose }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      setError('GitHub URL is required');
      return;
    }

    if (!name.trim()) {
      setError('Server name is required');
      return;
    }

    // Validate GitHub URL format
    const githubUrlPattern = /^https:\/\/github\.com\/[^\/]+\/[^\/]+/;
    if (!githubUrlPattern.test(url.trim())) {
      setError('Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo)');
      return;
    }

    setIsInstalling(true);
    setError(null);
    setInstallProgress('Cloning repository...');

    try {
      const response = await apiPost('/servers/github/install', {
        url: url.trim(),
        name: name.trim(),
      });

      if (response.success) {
        setInstallProgress('Installation completed successfully!');
        setTimeout(() => {
          onInstall();
          showToast(`Successfully installed "${name}" from GitHub`, 'success');
        }, 1000);
      } else {
        setError(response.message || 'Installation failed');
        setInstallProgress('');
      }
    } catch (err) {
      console.error('Error installing from GitHub:', err);
      setError('Installation failed. Please check the repository URL and try again.');
      setInstallProgress('');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    setError(null);

    // Auto-generate server name from URL
    if (newUrl && !name) {
      try {
        const match = newUrl.match(/github\.com\/[^\/]+\/([^\/]+)/);
        if (match) {
          const repoName = match[1].replace(/\.git$/, '');
          setName(repoName);
        }
      } catch (error) {
        // Ignore URL parsing errors
      }
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Github className="h-6 w-6 text-gray-700" />
            <h3 className="text-lg font-medium text-gray-900">Install from GitHub</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors btn-secondary"
            disabled={isInstalling}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {installProgress && (
            <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded flex items-center space-x-2">
              <Download className="h-5 w-5 animate-pulse" />
              <span className="text-sm">{installProgress}</span>
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="github-url" className="block text-sm font-medium text-gray-700 mb-2">
              GitHub Repository URL
            </label>
            <input
              id="github-url"
              type="url"
              value={url}
              onChange={handleUrlChange}
              placeholder="https://github.com/owner/repository"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              disabled={isInstalling}
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-500">
              Enter the full GitHub repository URL (public repositories only)
            </p>
          </div>

          <div className="mb-6">
            <label htmlFor="server-name" className="block text-sm font-medium text-gray-700 mb-2">
              Server Name
            </label>
            <input
              id="server-name"
              type="text"
              value={name}
              onChange={handleNameChange}
              placeholder="my-mcp-server"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              disabled={isInstalling}
            />
            <p className="mt-1 text-xs text-gray-500">
              Choose a unique name for this server in your configuration
            </p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-yellow-700">
                <p className="font-medium mb-1">Installation Process:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Repository will be cloned to the PROJECTS directory</li>
                  <li>Dependencies will be automatically installed</li>
                  <li>MCP server configuration will be generated</li>
                  <li>Server will be added to your configuration</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 btn-secondary"
              disabled={isInstalling}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              disabled={isInstalling || !url.trim() || !name.trim()}
            >
              {isInstalling ? (
                <>
                  <Download className="h-4 w-4 animate-pulse" />
                  <span>Installing...</span>
                </>
              ) : (
                <>
                  <Github className="h-4 w-4" />
                  <span>Install Server</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GitHubInstallDialog;
