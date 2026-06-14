import type { JSX } from "react";
import { useTranslation } from "react-i18next";

import type { User } from "../../types";

type CollaboratorsFieldProps = {
  editing: boolean;
  isOwner: boolean;
  saving: boolean;
  collaborators: string[];
  editCollaboratorIds: string[];
  onEditCollaboratorIdsChange: (ids: string[]) => void;
  allUsers: User[];
  ownerNameById: Record<string, string>;
  ownerId: string;
};

const everyoneIcon = (
  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2a10 10 0 100 20 10 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zM12 11a2 2 0 1000 4 2 2 0 000-4z" />
  </svg>
);

const removeIcon = (
  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export function CollaboratorsField({
  editing,
  isOwner,
  saving,
  collaborators,
  editCollaboratorIds,
  onEditCollaboratorIdsChange,
  allUsers,
  ownerNameById,
  ownerId
}: CollaboratorsFieldProps): JSX.Element | null {
  const { t } = useTranslation("playlists");
  const availableCollaborators = allUsers.filter(
    (u) => u.id !== ownerId && !editCollaboratorIds.includes(u.id)
  );

  if (editing && isOwner) {
    return (
      <div className="mt-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-flaque-steel">{t("collaborators.label")}</span>
          {editCollaboratorIds.includes("everyone") ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-yellow-600">
              {everyoneIcon}
              {t("collaborators.everyone")}
              <button
                type="button"
                className="ml-0.5 text-flaque-steel hover:text-red-500"
                onClick={() => onEditCollaboratorIdsChange(editCollaboratorIds.filter((c) => c !== "everyone"))}
                aria-label={t("collaborators.removeEveryone")}
              >
                {removeIcon}
              </button>
            </span>
          ) : (
            editCollaboratorIds.map((collab) => {
              const u = allUsers.find((usr) => usr.id === collab);
              return (
                <span key={collab} className="inline-flex items-center gap-1 rounded-full bg-flaque-cream px-2 py-0.5 text-[10px] font-medium text-flaque-ink">
                  {u?.username ?? ownerNameById[collab] ?? collab}
                  <button
                    type="button"
                    className="text-flaque-steel hover:text-red-500"
                    onClick={() => onEditCollaboratorIdsChange(editCollaboratorIds.filter((c) => c !== collab))}
                    aria-label={t("collaborators.remove", { name: u?.username ?? collab })}
                  >
                    {removeIcon}
                  </button>
                </span>
              );
            })
          )}
        </div>
        {availableCollaborators.length > 0 || !editCollaboratorIds.includes("everyone") ? (
          <select
            className="mt-1 rounded-lg border border-flaque-clay/40 bg-transparent px-2 py-1 text-xs text-flaque-ink outline-none transition focus:border-flaque-ink/40"
            value=""
            onChange={(e) => {
              if (e.target.value) onEditCollaboratorIdsChange([...editCollaboratorIds, e.target.value]);
            }}
            disabled={saving}
          >
            <option value="">{t("collaborators.add")}</option>
            {!editCollaboratorIds.includes("everyone") ? (
              <option value="everyone">{t("collaborators.everyone")}</option>
            ) : null}
            {availableCollaborators.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        ) : null}
      </div>
    );
  }

  if (collaborators.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <span className="text-xs text-flaque-steel">{t("collaborators.label")}</span>
      {collaborators.includes("everyone") ? (
        <span className="flex items-center gap-0.5 text-[10px] text-yellow-600">
          {everyoneIcon}
          {t("collaborators.everyone")}
        </span>
      ) : (
        collaborators.map((collab) => (
          <span key={collab} className="rounded-full bg-flaque-cream px-2 py-0.5 text-[10px] font-medium text-flaque-ink">
            {ownerNameById[collab] ?? collab}
          </span>
        ))
      )}
    </div>
  );
}
