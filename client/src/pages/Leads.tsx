import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useEffect, useState } from "react";
import { Loader2, Download } from "lucide-react";

export default function Leads() {
  const { loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const { data: leads, isLoading } = trpc.leads.list.useQuery(
    {
      limit: 1000,
      status: statusFilter,
    },
    {
      enabled: isAuthenticated && !loading,
    }
  );

  const exportCsv = trpc.leads.exportCsv.useQuery(undefined, {
    enabled: isAuthenticated && !loading,
  });

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-[#89CFF0]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const statuses = ["all", "new", "qualified", "rejected", "closed"];

  const handleDownloadCsv = () => {
    if (exportCsv.data) {
      const element = document.createElement("a");
      element.setAttribute(
        "href",
        "data:text/csv;charset=utf-8," + encodeURIComponent(exportCsv.data.csv)
      );
      element.setAttribute("download", exportCsv.data.filename);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#89CFF0]">
              Qualified Leads
            </h1>
            <p className="text-[#c8ecfb] mt-2">
              All captured bookings and inquiries
            </p>
          </div>
          <Button
            onClick={() => exportCsv.refetch().then(handleDownloadCsv)}
            disabled={exportCsv.isLoading}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {statuses.map(status => (
                <Button
                  key={status}
                  variant={
                    statusFilter === (status === "all" ? undefined : status)
                      ? "default"
                      : "outline"
                  }
                  onClick={() =>
                    setStatusFilter(status === "all" ? undefined : status)
                  }
                  className="capitalize"
                >
                  {status.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Leads Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Leads</CardTitle>
            <CardDescription>
              {leads?.length || 0} lead{leads?.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#89CFF0]" />
              </div>
            ) : leads && leads.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#89CFF0]/18">
                      <th className="text-left py-3 px-4 font-semibold text-[#dff5ff]">
                        Date
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-[#dff5ff]">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-[#dff5ff]">
                        Service
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-[#dff5ff]">
                        Duration
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-[#dff5ff]">
                        Guests
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-[#dff5ff]">
                        Address
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-[#dff5ff]">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map(lead => {
                      const extracted = (lead.extractedFields as any) || {};
                      return (
                        <tr
                          key={lead.id}
                          className="border-b border-[#89CFF0]/12 hover:bg-[#17112c]/55"
                        >
                          <td className="py-3 px-4 text-[#89CFF0]">
                            {lead.timestamp
                              ? new Date(lead.timestamp).toLocaleDateString()
                              : ""}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                lead.status === "qualified"
                                  ? "bg-[#b8ffdc] text-[#123222]"
                                  : lead.status === "rejected"
                                    ? "bg-[#ff9ab3] text-[#3a1018]"
                                    : "bg-[#2a1848] text-[#dff5ff]"
                              }`}
                            >
                              {lead.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[#dff5ff]">
                            {extracted.bookingType || "—"}
                          </td>
                          <td className="py-3 px-4 text-[#dff5ff]">
                            {extracted.duration || "—"}
                          </td>
                          <td className="py-3 px-4 text-[#dff5ff]">
                            {extracted.guestCount || "—"}
                          </td>
                          <td className="py-3 px-4 text-[#dff5ff] truncate max-w-xs">
                            {extracted.fullAddress
                              ? extracted.fullAddress.substring(0, 30)
                              : "—"}
                          </td>
                          <td className="py-3 px-4 text-[#dff5ff]">
                            {lead.handoffReason || lead.rejectionReason || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-[#c8ecfb]">No leads found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
