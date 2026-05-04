import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { maskPhone } from "@/lib/phone";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useEffect, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";

export default function Conversations() {
  const { loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const { data: conversations, isLoading } = trpc.conversations.list.useQuery(
    {
      limit: 100,
      status: statusFilter,
    },
    {
      enabled: isAuthenticated && !loading,
    }
  );

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

  const statuses = [
    "all",
    "new",
    "collecting_details",
    "qualified",
    "handoff_needed",
    "rejected",
    "closed",
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#89CFF0]">Conversations</h1>
          <p className="text-[#c8ecfb] mt-2">
            Manage all your SMS conversations
          </p>
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

        {/* Conversations List */}
        <Card>
          <CardHeader>
            <CardTitle>All Conversations</CardTitle>
            <CardDescription>
              {conversations?.length || 0} conversation
              {conversations?.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#89CFF0]" />
              </div>
            ) : conversations && conversations.length > 0 ? (
              <div className="space-y-2">
                {conversations.map(conv => (
                  <div
                    key={conv.id}
                    className="flex items-center justify-between p-4 border border-[#89CFF0]/18 rounded-lg hover:bg-[#17112c]/55 cursor-pointer transition-colors"
                    onClick={() => navigate(`/conversations/${conv.id}`)}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-[#89CFF0]">
                        {maskPhone(conv.customerPhone)}
                      </p>
                      <p className="text-sm text-[#c8ecfb]">
                        {conv.updatedAt
                          ? new Date(conv.updatedAt).toLocaleString()
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                          conv.status === "qualified"
                            ? "bg-[#b8ffdc] text-[#123222]"
                            : conv.status === "rejected"
                              ? "bg-[#ff9ab3] text-[#3a1018]"
                              : conv.status === "collecting_details"
                                ? "bg-[#89CFF0] text-[#17112c]"
                                : conv.status === "handoff_needed"
                                  ? "bg-[#ffc28f] text-[#3d220b]"
                                  : "bg-[#2a1848] text-[#dff5ff]"
                        }`}
                      >
                        {conv.status.replace(/_/g, " ")}
                      </span>
                      {conv.shouldHandoff && (
                        <span className="px-2 py-1 bg-[#ffc28f] text-[#3d220b] rounded text-xs font-medium">
                          Handoff
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <MessageCircle className="w-12 h-12 text-[#89CFF0]/35 mx-auto mb-3" />
                <p className="text-[#c8ecfb]">No conversations found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
