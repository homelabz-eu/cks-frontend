// frontend/pages/admin.js
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { PageHeader, ErrorState, LoadingState } from '../components/common';
import AdminStats from '../components/AdminStats';
import AdminClusterTable from '../components/AdminClusterTable';
import AdminSessionTable from '../components/AdminSessionTable';
import api from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useError } from '../hooks/useError';

export default function AdminPage() {
  const [clusters, setClusters] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [isLoadingClusters, setIsLoadingClusters] = useState(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isReleasing, setIsReleasing] = useState(false);
  const [isDestroying, setIsDestroying] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrappingCluster, setBootstrappingCluster] = useState(null);
  const [destroyingCluster, setDestroyingCluster] = useState(null);
  const { error, handleError, clearError } = useError('admin');
  const toast = useToast();

  // Fetch clusters data
  const fetchClusters = async () => {
    try {
      setIsLoadingClusters(true);
      const data = await api.admin.getClusters();
      setClusters(data);
      clearError();
    } catch (err) {
      handleError(err, 'fetch-clusters');
    } finally {
      setIsLoadingClusters(false);
    }
  };

  // Fetch sessions data
  const fetchSessions = async () => {
    try {
      setIsLoadingSessions(true);
      const data = await api.admin.getSessions();
      setSessions(data);
      clearError();
    } catch (err) {
      handleError(err, 'fetch-sessions');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchClusters();
    fetchSessions();
  }, []);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchClusters();
      fetchSessions();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Handle release all clusters
  const handleReleaseAllClusters = async () => {
    try {
      setIsReleasing(true);
      await api.admin.releaseAllClusters();
      toast.success('All clusters have been released successfully');
      // Refresh data after releasing
      await fetchClusters();
      await fetchSessions();
    } catch (err) {
      console.error('Failed to release clusters:', err);
      toast.error('Failed to release clusters. Please try again.');
    } finally {
      setIsReleasing(false);
    }
  };

  // Handle destroy pool
  const handleDestroyPool = async () => {
    if (!window.confirm('This will destroy ALL cluster VMs, snapshots, and resources. Continue?')) return;
    try {
      setIsDestroying(true);
      await api.admin.destroyPool();
      toast.success('Pool destroyed successfully');
      await fetchClusters();
      await fetchSessions();
    } catch (err) {
      console.error('Failed to destroy pool:', err);
      toast.error('Failed to destroy pool. Please try again.');
    } finally {
      setIsDestroying(false);
    }
  };

  // Handle bootstrap pool
  const handleBootstrapPool = async () => {
    if (!window.confirm('This will create all cluster VMs from scratch. This takes several minutes. Continue?')) return;
    try {
      setIsBootstrapping(true);
      toast.success('Bootstrap started - this will take several minutes...');
      await api.admin.bootstrapPool();
      toast.success('Pool bootstrapped successfully');
      await fetchClusters();
      await fetchSessions();
    } catch (err) {
      console.error('Failed to bootstrap pool:', err);
      toast.error('Failed to bootstrap pool. Check backend logs.');
    } finally {
      setIsBootstrapping(false);
    }
  };

  const handleBootstrapCluster = async (clusterId) => {
    if (!window.confirm(`Bootstrap ${clusterId} from scratch? This takes several minutes.`)) return;
    try {
      setBootstrappingCluster(clusterId);
      toast.success(`Bootstrap started for ${clusterId}...`);
      await api.admin.bootstrapCluster(clusterId);
      toast.success(`${clusterId} bootstrapped successfully`);
      await fetchClusters();
    } catch (err) {
      console.error(`Failed to bootstrap ${clusterId}:`, err);
      toast.error(`Failed to bootstrap ${clusterId}. Check backend logs.`);
    } finally {
      setBootstrappingCluster(null);
    }
  };

  const handleDestroyCluster = async (clusterId) => {
    if (!window.confirm(`Destroy all resources for ${clusterId}? This will delete VMs, snapshots, and restores.`)) return;
    try {
      setDestroyingCluster(clusterId);
      await api.admin.destroyCluster(clusterId);
      toast.success(`${clusterId} destroyed successfully`);
      await fetchClusters();
    } catch (err) {
      console.error(`Failed to destroy ${clusterId}:`, err);
      toast.error(`Failed to destroy ${clusterId}. Check backend logs.`);
    } finally {
      setDestroyingCluster(null);
    }
  };

  // Handle delete session
  const handleDeleteSession = async (sessionId) => {
    try {
      await api.admin.deleteSession(sessionId);
      toast.success(`Session ${sessionId} deleted successfully`);
      // Refresh data after deletion
      await fetchSessions();
      await fetchClusters();
    } catch (err) {
      console.error('Failed to delete session:', err);
      toast.error(`Failed to delete session ${sessionId}. Please try again.`);
      throw err; // Re-throw so the component can handle loading states
    }
  };

  // Handle manual refresh
  const handleRefresh = async () => {
    await Promise.all([fetchClusters(), fetchSessions()]);
    toast.success('Data refreshed');
  };

  const isLoading = isLoadingClusters && isLoadingSessions && !clusters && !sessions;

  if (isLoading) {
    return <LoadingState message="Loading admin dashboard..." size="lg" />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Head>
        <title>Admin Dashboard | CKS Practice</title>
        <meta name="description" content="CKS Lab Administration Dashboard" />
      </Head>

      <PageHeader
        title="Admin Dashboard"
        description="Manage clusters and monitor active lab sessions"
        actions={
          <button
            onClick={handleRefresh}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            disabled={isLoadingClusters || isLoadingSessions}
          >
            <svg className={`-ml-1 mr-2 h-4 w-4 ${(isLoadingClusters || isLoadingSessions) ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        }
      />

      {/* Error state */}
      {error && (
        <ErrorState
          message="Failed to load admin data"
          details={error.message}
          onRetry={() => {
            clearError();
            handleRefresh();
          }}
        />
      )}

      {/* Stats overview */}
      <AdminStats
        clusterStats={clusters}
        sessionStats={sessions?.stats}
      />

      {/* Clusters section */}
      <div className="mb-8">
        <AdminClusterTable
          clusters={clusters}
          isLoading={isLoadingClusters}
          onReleaseAll={handleReleaseAllClusters}
          isReleasing={isReleasing}
          onDestroyPool={handleDestroyPool}
          isDestroying={isDestroying}
          onBootstrapPool={handleBootstrapPool}
          isBootstrapping={isBootstrapping}
          onBootstrapCluster={handleBootstrapCluster}
          bootstrappingCluster={bootstrappingCluster}
          onDestroyCluster={handleDestroyCluster}
          destroyingCluster={destroyingCluster}
        />
      </div>

      {/* Sessions section */}
      <div className="mb-8">
        <AdminSessionTable
          sessions={sessions}
          isLoading={isLoadingSessions}
          onDeleteSession={handleDeleteSession}
        />
      </div>

      {/* Auto-refresh indicator */}
      <div className="text-center text-sm text-gray-500 mt-6">
        <p>Data refreshes automatically every 30 seconds</p>
      </div>
    </div>
  );
}