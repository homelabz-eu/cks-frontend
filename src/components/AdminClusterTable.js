// frontend/components/AdminClusterTable.js
import React from 'react';
import { Card, Button, StatusIndicator, LoadingState } from './common';

const AdminClusterTable = ({ clusters, isLoading, onReleaseAll, isReleasing, onDestroyPool, isDestroying, onBootstrapPool, isBootstrapping, onBootstrapCluster, bootstrappingCluster, onDestroyCluster, destroyingCluster }) => {
  if (isLoading) {
    return <LoadingState message="Loading clusters..." />;
  }

  if (!clusters || !clusters.detailedClusters) {
    return (
      <Card className="p-4">
        <p className="text-gray-500">No cluster data available.</p>
      </Card>
    );
  }

  const clusterList = Object.values(clusters.detailedClusters);

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return 'connected';
      case 'locked': return 'pending';
      case 'resetting': return 'loading';
      case 'error': return 'failed';
      default: return 'disconnected';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString || dateString === '0001-01-01T00:00:00Z') {
      return 'Never';
    }
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (lockTime) => {
    if (!lockTime || lockTime === '0001-01-01T00:00:00Z') {
      return '-';
    }
    const now = new Date();
    const lock = new Date(lockTime);
    const diffMs = now - lock;
    const diffMins = Math.floor(diffMs / 1000 / 60);

    if (diffMins < 60) {
      return `${diffMins}m`;
    }
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m`;
  };

  return (
    <Card>
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Cluster Management</h3>
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={onBootstrapPool}
            disabled={isBootstrapping || isDestroying}
            isLoading={isBootstrapping}
          >
            Bootstrap Pool
          </Button>
          <Button
            variant="danger"
            onClick={onReleaseAll}
            disabled={isReleasing || clusters.lockedClusters === 0}
            isLoading={isReleasing}
          >
            Release All Clusters
          </Button>
          <Button
            variant="danger"
            onClick={onDestroyPool}
            disabled={isDestroying || isBootstrapping}
            isLoading={isDestroying}
          >
            Destroy Pool
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cluster ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Session
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lock Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                VMs
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Reset
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Health Check
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {clusterList.map((cluster) => (
              <tr key={cluster.clusterId} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {cluster.clusterId}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusIndicator
                    status={getStatusColor(cluster.status)}
                    label={cluster.status}
                    size="sm"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {cluster.assignedSession ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {cluster.assignedSession}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDuration(cluster.lockTime)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="text-xs">
                    <div>CP: {cluster.controlPlaneVM}</div>
                    <div>WK: {cluster.workerNodeVM}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(cluster.lastReset)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(cluster.lastHealthCheck)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onBootstrapCluster(cluster.clusterId)}
                      disabled={bootstrappingCluster === cluster.clusterId || destroyingCluster === cluster.clusterId || isBootstrapping}
                      isLoading={bootstrappingCluster === cluster.clusterId}
                    >
                      Bootstrap
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => onDestroyCluster(cluster.clusterId)}
                      disabled={destroyingCluster === cluster.clusterId || bootstrappingCluster === cluster.clusterId || isDestroying}
                      isLoading={destroyingCluster === cluster.clusterId}
                    >
                      Destroy
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default AdminClusterTable;