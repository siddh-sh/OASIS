import { useAuth } from '@/hooks/useAuth'
import { REFRESH_CHOICES, useRefreshPreference, type RefreshChoice } from '@/store/refreshPreference'

export function SettingsPage() {
  const { profile } = useAuth()
  const refreshChoice = useRefreshPreference((s) => s.choice)
  const setRefreshChoice = useRefreshPreference((s) => s.setChoice)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">Settings / Profile</h1>
      {profile && (
        <dl className="grid max-w-md grid-cols-2 gap-y-2 rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
          <dt className="text-ocean-500">Email</dt>
          <dd>{profile.email}</dd>
          <dt className="text-ocean-500">Name</dt>
          <dd>{profile.full_name ?? '—'}</dd>
          <dt className="text-ocean-500">Role</dt>
          <dd className="capitalize">{profile.role}</dd>
          <dt className="text-ocean-500">Institution</dt>
          <dd>{profile.institution ?? '—'}</dd>
          <dt className="text-ocean-500">Member since</dt>
          <dd>{new Date(profile.created_at).toLocaleDateString()}</dd>
        </dl>
      )}
      <label className="flex max-w-md flex-col gap-1 rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
        <span className="font-medium text-ocean-950 dark:text-ocean-50">When I refresh a page</span>
        <select
          value={refreshChoice}
          onChange={(e) => setRefreshChoice(e.target.value as RefreshChoice)}
          className="rounded-md border border-ocean-300 px-3 py-2 dark:border-ocean-700 dark:bg-ocean-950"
        >
          {REFRESH_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
