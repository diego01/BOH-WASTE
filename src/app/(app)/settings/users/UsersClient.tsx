"use client";

import { useState, useTransition } from "react";
import type { Role } from "@/db/schema";
import { IconPlus } from "@/components/icons";
import { Badge, BottomSheet, Button, cx, ErrorText, Label, SelectField, TextField, Toggle } from "@/components/ui";
import { pinRule, ROLES } from "@/lib/domain";
import { useT } from "@/components/I18nProvider";
import { saveUser } from "../actions";

type U = { id: string; name: string; role: Role; active: boolean; mustChangePin: boolean; locked: boolean };
type Draft = { id?: string; name: string; role: Role; active: boolean; pin: string; locked?: boolean };

export function UsersClient({ users, meId }: { users: U[]; meId: string }) {
  const { t, L } = useT();
  const [draft, setDraft] = useState<Draft | null>(null);
  const activeAdmins = users.filter((u) => u.role === "ADMIN" && u.active).length;

  return (
    <>
      <p className="text-[15px] leading-snug text-ink/80">
        {t(
          "Create users and assign a profile. New users and PIN resets get a temporary PIN that must be changed at first sign-in.",
          "Crea usuarios y asigna un perfil. Los usuarios nuevos y los PIN restablecidos reciben un PIN temporal que se cambia en el primer ingreso.",
        )}
      </p>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-white shadow-sm">
        {users.map((u) => (
          <li key={u.id}>
            <button
              onClick={() => setDraft({ id: u.id, name: u.name, role: u.role, active: u.active, pin: "", locked: u.locked })}
              className="flex min-h-16 w-full items-center justify-between gap-2 px-4 py-2 text-left active:bg-gray-50"
            >
              <span>
                <span className={cx("block text-[16px] font-medium capitalize", !u.active && "text-muted line-through")}>
                  {u.name}
                  {u.id === meId && <span className="ml-1 text-sm font-normal normal-case text-muted">({t("you", "tú")})</span>}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {u.mustChangePin && <Badge tone="warn">{t("Temp PIN", "PIN temporal")}</Badge>}
                  {u.locked && <Badge tone="waste">{t("Locked", "Bloqueado")}</Badge>}
                  {!u.active && <Badge>{t("Inactive", "Inactivo")}</Badge>}
                </span>
              </span>
              <Badge tone={u.role === "ADMIN" ? "brand" : "gray"}>{L.role[u.role]}</Badge>
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        className="mt-4 flex w-full items-center justify-center gap-2"
        onClick={() => setDraft({ name: "", role: "TEAM_MEMBER", active: true, pin: "" })}
      >
        <IconPlus /> {t("Add user", "Agregar usuario")}
      </Button>
      {draft && (
        <UserSheet
          key={draft.id ?? "new"}
          initial={draft}
          isLastAdmin={draft.role === "ADMIN" && activeAdmins <= 1 && !!users.find((u) => u.id === draft.id)?.active}
          onClose={() => setDraft(null)}
        />
      )}
    </>
  );
}

function UserSheet({ initial, isLastAdmin, onClose }: { initial: Draft; isLastAdmin: boolean; onClose: () => void }) {
  const { t, L } = useT();
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const isNew = !initial.id;
  const rule = pinRule(d.role);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const pinOk = d.pin === "" ? !isNew : /^\d+$/.test(d.pin) && d.pin.length >= rule.min && d.pin.length <= rule.max;

  function save(unlock = false) {
    setError(undefined);
    start(async () => {
      const res = await saveUser({ id: d.id, name: d.name, role: d.role, active: d.active, pin: d.pin || undefined, unlock });
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <BottomSheet
      open
      title={isNew ? t("New User", "Nuevo usuario") : t("Edit User", "Editar usuario")}
      onClose={onClose}
      footer={
        <div className="pb-3">
          <Button className="w-full" disabled={!dirty || !d.name.trim() || !pinOk || pending} onClick={() => save()}>
            {t("Save", "Guardar")}
          </Button>
        </div>
      }
    >
      <Label>{t("Name", "Nombre")}</Label>
      <TextField value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoCapitalize="words" />

      <Label strong>{t("Profile", "Perfil")}</Label>
      <SelectField
        value={d.role}
        onChange={(v) => setD({ ...d, role: v as Role })}
        options={ROLES.map((r) => ({ value: r, label: L.role[r] }))}
      />
      {isLastAdmin && d.role !== "ADMIN" && <p className="mt-2 text-sm text-bad">{t("This is the last active Admin and can't be demoted.", "Es el último Admin activo y no se puede cambiar de perfil.")}</p>}

      <Label>{isNew ? t("Temporary PIN", "PIN temporal") : t("Reset PIN (optional)", "Restablecer PIN (opcional)")}</Label>
      <TextField
        value={d.pin}
        onChange={(e) => setD({ ...d, pin: e.target.value.replace(/\D/g, "").slice(0, rule.max) })}
        inputMode="numeric"
        autoComplete="off"
        placeholder={t(`${rule.min}–${rule.max} digits`, `${rule.min}–${rule.max} dígitos`)}
      />
      <p className="mt-1 text-sm text-muted">{t("The user will be asked to choose their own PIN after signing in.", "Al ingresar, se le pedirá elegir su propio PIN.")}</p>

      <div className="mt-6 flex items-center justify-between">
        <span className="text-[17px] font-medium">{t("Active", "Activo")}</span>
        <Toggle checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t("Active", "Activo")} disabled={isLastAdmin && d.active} />
      </div>

      {initial.locked && (
        <Button variant="secondary" className="mt-4 w-full" disabled={pending} onClick={() => save(true)}>
          {t("Unlock (too many wrong PINs)", "Desbloquear (muchos PIN incorrectos)")}
        </Button>
      )}

      <ErrorText>{error}</ErrorText>
    </BottomSheet>
  );
}
