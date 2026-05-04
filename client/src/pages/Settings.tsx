import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  History,
  Loader2,
  MessageSquare,
  RotateCcw,
  Trash2,
  Unplug,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function Settings() {
  const { loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [googleOAuthHandled, setGoogleOAuthHandled] = useState(false);
  const [formData, setFormData] = useState({
    businessName: "",
    servicesOffered: "",
    pricing: "",
    availability: "",
    aiPersona: "",
    notificationEmail: "",
    twilioPhoneNumber: "",
    calendlyUrl: "",
    whatsappPhoneNumber: "",
    followUpEnabled: false,
  });

  const { data: account, isLoading: accountLoading } =
    trpc.accounts.getOrCreate.useQuery(undefined, {
      enabled: isAuthenticated && !loading,
    });
  const { data: personaVersions } = trpc.aiTraining.personaVersions.useQuery(
    { limit: 8 },
    { enabled: isAuthenticated && !loading }
  );
  const { data: calendarStatus, isLoading: calendarStatusLoading } =
    trpc.calendar.status.useQuery(undefined, {
      enabled: isAuthenticated && !loading,
    });
  const updateAccount = trpc.accounts.update.useMutation({
    onSuccess: async () => {
      await utils.aiTraining.personaVersions.invalidate();
    },
  });
  const startGoogleCalendarOAuth = trpc.calendar.startOAuth.useMutation({
    onSuccess: result => {
      window.location.assign(result.authUrl);
    },
    onError: error => toast.error(error.message),
  });
  const completeGoogleCalendarOAuth = trpc.calendar.completeOAuth.useMutation({
    onSuccess: async () => {
      toast.success("Google Calendar connected");
      await utils.calendar.status.invalidate();
      window.history.replaceState(null, "", "/settings");
    },
    onError: error => {
      toast.error(error.message);
      window.history.replaceState(null, "", "/settings");
    },
  });
  const disconnectGoogleCalendar = trpc.calendar.disconnect.useMutation({
    onSuccess: async () => {
      toast.success("Google Calendar disconnected");
      await utils.calendar.status.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const restorePersona = trpc.aiTraining.restorePersonaVersion.useMutation({
    onSuccess: async result => {
      setFormData(prev => ({ ...prev, aiPersona: result.aiPersona }));
      await utils.accounts.getOrCreate.invalidate();
      await utils.aiTraining.personaVersions.invalidate();
    },
  });
  const deleteAccount = trpc.accounts.deleteCurrent.useMutation({
    onSuccess: async () => {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      window.location.href = "/";
    },
  });

  useEffect(() => {
    if (account) {
      setFormData({
        businessName: account.businessName || "",
        servicesOffered: account.servicesOffered || "",
        pricing: account.pricing || "",
        availability: account.availability || "",
        aiPersona: account.aiPersona || "",
        notificationEmail: account.notificationEmail || "",
        twilioPhoneNumber: account.twilioPhoneNumber || "",
        calendlyUrl: account.calendlyUrl || "",
        whatsappPhoneNumber: account.whatsappPhoneNumber || "",
        followUpEnabled: account.followUpEnabled ?? false,
      });
    }
  }, [account]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    await updateAccount.mutateAsync(formData);
  };

  const googleCalendarConnected =
    calendarStatus?.googleCalendar.connected ?? false;
  const googleCalendarBusy =
    calendarStatusLoading ||
    startGoogleCalendarOAuth.isPending ||
    completeGoogleCalendarOAuth.isPending ||
    disconnectGoogleCalendar.isPending;
  const canDeleteAccount =
    Boolean(account?.businessName) &&
    deleteConfirmation === account?.businessName;

  useEffect(() => {
    if (loading || !isAuthenticated || googleOAuthHandled) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("googleCalendar") !== "callback") return;

    setGoogleOAuthHandled(true);

    const error = params.get("error");
    if (error) {
      toast.error("Google Calendar connection was cancelled");
      window.history.replaceState(null, "", "/settings");
      return;
    }

    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      toast.error("Google Calendar connection is missing required details");
      window.history.replaceState(null, "", "/settings");
      return;
    }

    completeGoogleCalendarOAuth.mutate({ code, state });
  }, [
    completeGoogleCalendarOAuth,
    googleOAuthHandled,
    isAuthenticated,
    loading,
  ]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading || accountLoading) {
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

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold text-[#89CFF0]">
            Account Settings
          </h1>
          <p className="text-[#c8ecfb] mt-2">
            Manage your business profile and preferences
          </p>
        </div>

        {/* Business Profile */}
        <Card>
          <CardHeader>
            <CardTitle>Business Profile</CardTitle>
            <CardDescription>Update your business information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                name="businessName"
                value={formData.businessName}
                onChange={handleInputChange}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="servicesOffered">Services Offered</Label>
              <Textarea
                id="servicesOffered"
                name="servicesOffered"
                value={formData.servicesOffered}
                onChange={handleInputChange}
                placeholder="List your services..."
                rows={4}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="pricing">Pricing</Label>
              <Textarea
                id="pricing"
                name="pricing"
                value={formData.pricing}
                onChange={handleInputChange}
                placeholder="Describe your pricing structure..."
                rows={4}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="availability">Availability</Label>
              <Textarea
                id="availability"
                name="availability"
                value={formData.availability}
                onChange={handleInputChange}
                placeholder="e.g., Monday-Friday 9AM-6PM, Weekend events available"
                rows={4}
                className="mt-2"
              />
            </div>
          </CardContent>
        </Card>

        {/* AI Persona */}
        <Card>
          <CardHeader>
            <CardTitle>AI Assistant Persona</CardTitle>
            <CardDescription>
              Customize how your AI assistant communicates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="aiPersona">Assistant Instructions</Label>
              <Textarea
                id="aiPersona"
                name="aiPersona"
                value={formData.aiPersona}
                onChange={handleInputChange}
                placeholder="Provide instructions for your AI assistant..."
                rows={6}
                className="mt-2"
              />
              <p className="text-sm text-[#c8ecfb] mt-2">
                These instructions guide how your AI assistant handles customer
                inquiries
              </p>
            </div>
            <div className="rounded-lg border border-[#89CFF0]/18 bg-[#17112c]/35 p-4">
              <div className="mb-4 flex items-center gap-2 text-[#89CFF0]">
                <History className="h-4 w-4" />
                <p className="font-medium">Version History</p>
              </div>
              <div className="space-y-3">
                {personaVersions && personaVersions.length > 0 ? (
                  personaVersions.map(version => (
                    <div
                      key={version.id}
                      className="flex flex-col gap-3 rounded-md border border-[#89CFF0]/12 bg-[#1e1235]/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#dff5ff]">
                          {version.label || `Version ${version.id}`}
                        </p>
                        <p className="mt-1 truncate text-xs text-[#c8ecfb]">
                          {new Date(version.createdAt).toLocaleString()} ·{" "}
                          {version.aiPersona}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          restorePersona.mutate({ versionId: version.id })
                        }
                        disabled={restorePersona.isPending}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Restore
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#c8ecfb]">
                    Saved persona versions will appear here after edits.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Configure how you receive alerts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="notificationEmail">Notification Email</Label>
              <Input
                id="notificationEmail"
                name="notificationEmail"
                type="email"
                value={formData.notificationEmail}
                onChange={handleInputChange}
                placeholder="your@email.com"
                className="mt-2"
              />
              <p className="text-sm text-[#c8ecfb] mt-2">
                Receive email notifications for new leads and bookings
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Configuration */}
        {account && (
          <Card>
            <CardHeader>
              <CardTitle>Twilio SMS Configuration</CardTitle>
              <CardDescription>
                Connect your Twilio phone number to receive SMS messages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="twilioPhoneNumber">Twilio Phone Number</Label>
                <Input
                  id="twilioPhoneNumber"
                  name="twilioPhoneNumber"
                  value={formData.twilioPhoneNumber}
                  onChange={handleInputChange}
                  placeholder="+15551234567"
                  className="mt-2"
                />
                <p className="text-sm text-[#c8ecfb] mt-2">
                  The Twilio number (E.164 format) assigned to this account.
                  Inbound SMS to this number will be routed here.
                </p>
              </div>
              <div>
                <Label>Webhook URL</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={`${window.location.origin}/api/webhook/twilio`}
                    readOnly
                    className="bg-[#17112c]/55"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/api/webhook/twilio`
                      );
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <p className="text-sm text-[#c8ecfb] mt-2">
                  Paste this URL into your Twilio phone number's "A message
                  comes in" webhook field (HTTP POST).
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Calendar Booking */}
        {account && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[#89CFF0]" />
                Calendar Booking
              </CardTitle>
              <CardDescription>
                Connect booking destinations for qualified leads
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border border-[#89CFF0]/18 bg-[#17112c]/35 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">Google Calendar</p>
                      <Badge
                        variant={
                          googleCalendarConnected ? "default" : "outline"
                        }
                        className={
                          googleCalendarConnected
                            ? "bg-[#b8ffdc] text-[#17112c]"
                            : "border-[#89CFF0]/30 text-[#c8ecfb]"
                        }
                      >
                        {googleCalendarConnected ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : null}
                        {googleCalendarConnected
                          ? "Connected"
                          : "Not connected"}
                      </Badge>
                    </div>
                    <p className="text-sm text-[#c8ecfb]">
                      Qualified leads can be added to your Google Calendar
                      automatically.
                    </p>
                    {googleCalendarConnected &&
                    calendarStatus?.googleCalendar.calendarId ? (
                      <p className="text-xs text-[#c8ecfb]/80">
                        Calendar: {calendarStatus.googleCalendar.calendarId}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={googleCalendarConnected ? "outline" : "default"}
                      onClick={() =>
                        startGoogleCalendarOAuth.mutate({
                          calendarId: "primary",
                        })
                      }
                      disabled={googleCalendarBusy}
                    >
                      {startGoogleCalendarOAuth.isPending ||
                      completeGoogleCalendarOAuth.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4" />
                      )}
                      {googleCalendarConnected ? "Reconnect" : "Connect"}
                    </Button>
                    {googleCalendarConnected ? (
                      <Button
                        variant="outline"
                        onClick={() => disconnectGoogleCalendar.mutate()}
                        disabled={googleCalendarBusy}
                      >
                        {disconnectGoogleCalendar.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Unplug className="h-4 w-4" />
                        )}
                        Disconnect
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="calendlyUrl">Calendly Booking URL</Label>
                <Input
                  id="calendlyUrl"
                  name="calendlyUrl"
                  value={formData.calendlyUrl}
                  onChange={handleInputChange}
                  placeholder="https://calendly.com/yourbusiness/booking"
                  className="mt-2"
                />
                <p className="text-sm text-[#c8ecfb] mt-2">
                  When pasted, this link is automatically appended to the SMS
                  when a customer qualifies. Leave blank to disable.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* WhatsApp */}
        {account && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-[#89CFF0]" />
                WhatsApp
              </CardTitle>
              <CardDescription>
                Accept booking inquiries via WhatsApp (same Twilio webhook)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="whatsappPhoneNumber">
                  WhatsApp Phone Number
                </Label>
                <Input
                  id="whatsappPhoneNumber"
                  name="whatsappPhoneNumber"
                  value={formData.whatsappPhoneNumber}
                  onChange={handleInputChange}
                  placeholder="+15551234567"
                  className="mt-2"
                />
                <p className="text-sm text-[#c8ecfb] mt-2">
                  Your Twilio WhatsApp-enabled number in E.164 format. Inbound
                  WhatsApp messages are routed here automatically — no separate
                  webhook needed.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Follow-up Sequences */}
        {account && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-[#89CFF0]" />
                Follow-up Sequences
              </CardTitle>
              <CardDescription>
                Automatically re-engage leads who go quiet and remind customers
                before their appointment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    Enable automated follow-ups
                  </p>
                  <p className="text-sm text-[#c8ecfb] mt-1">
                    Sends a follow-up after 2h and 24h of no reply, plus
                    reminders 24h and 1h before appointments.
                  </p>
                </div>
                <Switch
                  checked={formData.followUpEnabled}
                  onCheckedChange={checked =>
                    setFormData(prev => ({ ...prev, followUpEnabled: checked }))
                  }
                />
              </div>
              {formData.followUpEnabled && (
                <div className="rounded-lg border border-[#89CFF0]/18 bg-[#17112c]/35 p-4 space-y-2 text-sm text-[#c8ecfb]">
                  <p className="font-medium text-[#89CFF0]">
                    Active sequences:
                  </p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>2 hours after no reply — gentle nudge</li>
                    <li>24 hours after no reply — final check-in</li>
                    <li>24 hours before appointment — reminder</li>
                    <li>1 hour before appointment — heads-up</li>
                  </ul>
                  <p className="mt-2 text-xs">
                    Follow-ups are cancelled automatically if the customer
                    replies.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Danger Zone */}
        {account && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
              <CardDescription>
                Permanently delete your account and all associated business data
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Delete account</p>
                <p className="text-sm text-[#c8ecfb]">
                  This removes your profile, conversations, leads, messages, and
                  notifications.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4" />
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. Type your business name to
                      confirm deletion.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="space-y-2">
                    <Label htmlFor="deleteConfirmation">
                      Business name: {account.businessName}
                    </Label>
                    <Input
                      id="deleteConfirmation"
                      value={deleteConfirmation}
                      onChange={event =>
                        setDeleteConfirmation(event.target.value)
                      }
                      placeholder={account.businessName}
                    />
                    {deleteAccount.error ? (
                      <p className="text-sm text-destructive">
                        {deleteAccount.error.message}
                      </p>
                    ) : null}
                  </div>

                  <AlertDialogFooter>
                    <AlertDialogCancel
                      onClick={() => setDeleteConfirmation("")}
                    >
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      disabled={!canDeleteAccount || deleteAccount.isPending}
                      onClick={event => {
                        event.preventDefault();
                        deleteAccount.mutate();
                      }}
                    >
                      {deleteAccount.isPending
                        ? "Deleting..."
                        : "Delete Account"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}

        {/* Save Button */}
        <div className="flex gap-4">
          <Button
            onClick={handleSave}
            disabled={updateAccount.isPending}
            size="lg"
          >
            {updateAccount.isPending ? "Saving..." : "Save Changes"}
          </Button>
          {updateAccount.isSuccess && (
            <p className="text-[#b8ffdc] flex items-center">✓ Changes saved</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
