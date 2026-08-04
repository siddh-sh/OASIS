import { useAuth } from '@/hooks/useAuth'

export function SettingsPage() {
  const { profile } = useAuth()

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
    </div>
  )
}
