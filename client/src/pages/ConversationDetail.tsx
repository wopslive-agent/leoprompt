import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatPhone } from "@/lib/phone";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, useRoute } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useEffect, useState } from "react";
import { Loader2, ArrowLeft, Download, Tags } from "lucide-react";

type FeedbackRating = "works_well" | "needs_improvement" | "bug";

export default function ConversationDetail() {
  const { loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/conversations/:id");
  const conversationId = params?.id ? parseInt(params.id) : null;
  const [note, setNote] = useState("");
  const [feedbackRating, setFeedbackRating] =
    useState<FeedbackRating>("works_well");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.conversations.getDetail.useQuery(
    {
      conversationId: conversationId ?? 0,
    },
    {
      enabled: Boolean(conversationId) && isAuthenticated && !loading,
    }
  );

  const addNote = trpc.conversations.addNote.useMutation({
    onSuccess: () => {
      setNote("");
    },
  });

  const updateStatus = trpc.conversations.updateStatus.useMutation();
  const { data: review } = trpc.aiTraining.getConversationReview.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: Boolean(conversationId) && isAuthenticated && !loading }
  );
  const saveFeedback = trpc.aiTraining.saveFeedback.useMutation({
    onSuccess: async () => {
      await utils.aiTraining.getConversationReview.invalidate({
        conversationId: conversationId ?? 0,
      });
    },
  });
  const saveTags = trpc.aiTraining.setTags.useMutation({
    onSuccess: async () => {
      await utils.aiTraining.getConversationReview.invalidate({
        conversationId: conversationId ?? 0,
      });
    },
  });

  useEffect(() => {
    if (review?.feedback) {
      setFeedbackRating(review.feedback.rating as FeedbackRating);
      setFeedbackComment(review.feedback.comment ?? "");
    }
    if (review?.tags) {
      setTagsInput(review.tags.join(", "));
    }
  }, [review]);

  useEffect(() => {
    if (!loading && (!isAuthenticated || !conversationId)) {
      navigate("/");
    }
  }, [conversationId, isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-[#89CFF0]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAuthenticated || !conversationId) {
    return null;
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-[#89CFF0]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-[#c8ecfb]">Conversation not found</p>
        </div>
      </DashboardLayout>
    );
  }

  const { conversation, messages } = data;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/conversations")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-[#89CFF0]">
              {formatPhone(conversation.customerPhone)}
            </h1>
            <p className="text-[#c8ecfb] mt-1">
              Started{" "}
              {conversation.createdAt
                ? new Date(conversation.createdAt).toLocaleString()
                : ""}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Message Thread</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {messages && messages.length > 0 ? (
                    messages.map(msg => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-xs px-4 py-2 rounded-lg ${
                            msg.role === "user"
                              ? "bg-[#89CFF0] text-[#17112c]"
                              : "bg-[#2a1848] text-[#89CFF0]"
                          }`}
                        >
                          <p className="text-sm">{msg.body}</p>
                          <p
                            className={`text-xs mt-1 ${
                              msg.role === "user"
                                ? "text-[#24314a]"
                                : "text-[#c8ecfb]"
                            }`}
                          >
                            {msg.createdAt
                              ? new Date(msg.createdAt).toLocaleTimeString()
                              : ""}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-[#c8ecfb]">
                      No messages yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add Manager Note</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add a note for your team..."
                  rows={3}
                />
                <Button
                  onClick={() =>
                    addNote.mutateAsync({
                      conversationId,
                      note,
                    })
                  }
                  disabled={!note || addNote.isPending}
                >
                  {addNote.isPending ? "Adding..." : "Add Note"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Training Feedback</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    ["works_well", "Works well"],
                    ["needs_improvement", "Needs work"],
                    ["bug", "Bug"],
                  ].map(([value, label]) => (
                    <Button
                      key={value}
                      variant={
                        feedbackRating === value ? "default" : "outline"
                      }
                      onClick={() => setFeedbackRating(value as FeedbackRating)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <Textarea
                  value={feedbackComment}
                  onChange={event => setFeedbackComment(event.target.value)}
                  placeholder="What should the AI learn from this conversation?"
                  rows={3}
                />
                <Button
                  onClick={() =>
                    saveFeedback.mutate({
                      conversationId,
                      rating: feedbackRating,
                      comment: feedbackComment,
                    })
                  }
                  disabled={saveFeedback.isPending}
                >
                  {saveFeedback.isPending ? "Saving..." : "Save Feedback"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div
                  className={`px-3 py-2 rounded-lg text-center font-medium ${
                    conversation.status === "qualified"
                      ? "bg-[#b8ffdc] text-[#123222]"
                      : conversation.status === "rejected"
                        ? "bg-[#ff9ab3] text-[#3a1018]"
                        : conversation.status === "collecting_details"
                          ? "bg-[#89CFF0] text-[#17112c]"
                          : "bg-[#2a1848] text-[#dff5ff]"
                  }`}
                >
                  {String(conversation.status).replace(/_/g, " ")}
                </div>
                <div className="space-y-2">
                  {[
                    "qualified",
                    "collecting_details",
                    "rejected",
                    "closed",
                  ].map(status => (
                    <Button
                      key={status}
                      variant="outline"
                      className="w-full capitalize"
                      onClick={() =>
                        updateStatus.mutateAsync({
                          conversationId,
                          status: status as any,
                        })
                      }
                      disabled={updateStatus.isPending}
                    >
                      Mark as {status.replace(/_/g, " ")}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {conversation.currentState ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Extracted Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    {Object.entries(
                      conversation.currentState as Record<string, unknown>
                    ).map(([key, value]) => {
                      let displayValue = "";
                      if (typeof value === "string") {
                        displayValue = value;
                      } else if (typeof value === "number") {
                        displayValue = String(value);
                      } else if (typeof value === "boolean") {
                        displayValue = String(value);
                      } else if (value === null) {
                        displayValue = "null";
                      } else {
                        try {
                          displayValue = JSON.stringify(value);
                        } catch {
                          displayValue = "[object]";
                        }
                      }

                      return (
                        <div key={key}>
                          <p className="font-medium text-[#dff5ff] capitalize">
                            {key.replace(/_/g, " ")}
                          </p>
                          <p className="text-[#c8ecfb] break-words">
                            {displayValue}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Tags className="h-4 w-4" />
                  Training Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tags">Tags</Label>
                  <Input
                    id="tags"
                    value={tagsInput}
                    onChange={event => setTagsInput(event.target.value)}
                    placeholder="works_well, needs_improvement, bug"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {review?.tags.map(tag => (
                    <Badge
                      key={tag}
                      className="border-[#89CFF0]/30 bg-[#89CFF0]/15 text-[#89CFF0]"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    saveTags.mutate({
                      conversationId,
                      tags: tagsInput.split(","),
                    })
                  }
                  disabled={saveTags.isPending}
                >
                  {saveTags.isPending ? "Saving..." : "Save Tags"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    const exported =
                      await utils.aiTraining.exportConversation.fetch({
                        conversationId,
                      });
                    await navigator.clipboard.writeText(exported.text);
                  }}
                >
                  <Download className="h-4 w-4" />
                  Copy Export
                </Button>
              </CardContent>
            </Card>

            {conversation.riskFlags ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Risk Flags</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {typeof conversation.riskFlags === "string" ? (
                      (() => {
                        try {
                          const flags = JSON.parse(
                            conversation.riskFlags
                          ) as string[];
                          return flags.map((flag: string, idx: number) => (
                            <div
                              key={idx}
                              className="px-2 py-1 bg-[#ff9ab3] text-[#3a1018] rounded text-sm"
                            >
                              {flag}
                            </div>
                          ));
                        } catch {
                          return (
                            <p className="text-[#c8ecfb]">
                              Invalid risk flags format
                            </p>
                          );
                        }
                      })()
                    ) : (
                      <p className="text-[#c8ecfb]">No risk flags</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
