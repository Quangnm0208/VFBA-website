import { Badge, Button, Card, Checkbox, Flex, Grid, Heading, Select, Stack, Text, TextInput } from '@sanity/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Api, Me } from './api';
import { errorText, formatTime, KINDS, kindLabel, roleLabel } from './labels';
import { Alert, BetaNote, Field, Loading, Notice, Page, TableBox } from './ui';

interface StaffRow {
  email: string;
  role: 'admin' | 'staff';
  kinds: string[];
  active: boolean;
  bound: boolean;
  last_login_at: string | null;
  created_by: string | null;
}

export function StaffApp({ api, me }: { api: Api; me: Me }) {
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'staff'>('staff');
  const [kinds, setKinds] = useState<string[]>(KINDS.map((k) => k.value));

  // `keepError`: after an action that failed, reloading shows what is true now but must not erase the explanation of the failure.
  const load = useCallback(
    async (keepError = false) => {
      if (me.role !== 'admin') return;
      const result = await api.call<{ staff: StaffRow[] }>('staff.list');
      if (result.ok) {
        setRows(result.data.staff);
        if (!keepError) setError(null);
      } else setError(errorText(result.code, result.status));
    },
    [api, me.role],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (me.role !== 'admin') {
    return (
      <Page>
        <BetaNote />
        <Alert>{errorText('forbidden')}</Alert>
      </Page>
    );
  }

  const run = async (op: string, params: Record<string, unknown>, done: string) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const result = await api.call(op, params);
    setBusy(false);
    if (result.ok) {
      setNotice(done);
      setError(null);
    } else setError(errorText(result.code, result.status));
    await load(!result.ok);
    return result.ok;
  };
  const invite = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run('staff.upsert', { email, role, kinds }, 'Đã lưu nhân sự. Người này cần là thành viên dự án Sanity và đăng nhập Cổng bằng đúng email này.');
    if (ok) setEmail('');
  };
  const toggleKind = (kind: string) => setKinds((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));

  return (
    <Page>
      <BetaNote />
      <Stack gap={2}>
        <Heading as="h1" size={3}>
          Quản trị nhân sự
        </Heading>
        <Text size={1} muted>
          Ai được xem và xử lý Lead. Quyền ở đây do quản trị viên quyết định; việc đăng nhập do Sanity xác thực. Người được thêm phải là thành viên dự án Sanity (mời tại sanity.io/manage).
        </Text>
      </Stack>
      {notice ? <Notice>{notice}</Notice> : null}
      {error ? <Alert>{error}</Alert> : null}

      <Card padding={3} radius={2} border as="form" onSubmit={invite} aria-label="Thêm hoặc cập nhật nhân sự">
        <Stack gap={4}>
          <Heading as="h2" size={1}>
            Thêm hoặc cập nhật nhân sự
          </Heading>
          <Grid gridTemplateColumns={[1, 1, 3]} gap={3}>
            <Field id="s-email" label="Email (đúng email tài khoản Sanity)">
              <TextInput id="s-email" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
            </Field>
            <Field id="s-role" label="Vai trò">
              <Select id="s-role" value={role} onChange={(e) => setRole(e.currentTarget.value === 'admin' ? 'admin' : 'staff')}>
                <option value="staff">Nhân viên (xem và xử lý Lead)</option>
                <option value="admin">Quản trị viên (thêm quản lý nhân sự)</option>
              </Select>
            </Field>
            <Stack gap={2} as="fieldset" style={{ border: 0, padding: 0, margin: 0 }}>
              <Text as="legend" size={1} weight="medium">
                Phạm vi Lead
              </Text>
              {KINDS.map((k) => (
                <Flex key={k.value} align="center" gap={2}>
                  <Checkbox id={`s-kind-${k.value}`} checked={kinds.includes(k.value)} onChange={() => toggleKind(k.value)} />
                  <Text as="label" htmlFor={`s-kind-${k.value}`} size={1}>
                    {k.label}
                  </Text>
                </Flex>
              ))}
            </Stack>
          </Grid>
          <Flex>
            <Button type="submit" text="Lưu nhân sự" disabled={busy || kinds.length === 0 || email.trim() === ''} />
          </Flex>
        </Stack>
      </Card>

      {!rows && !error ? <Loading label="Đang tải danh sách nhân sự…" /> : null}
      {rows ? (
        <TableBox>
          <table>
            <caption>Nhân sự được phép dùng CRM ({rows.length})</caption>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Vai trò</th>
                <th scope="col">Phạm vi</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Đăng nhập gần nhất</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.email}>
                  <td>{row.email}</td>
                  <td>{roleLabel(row.role)}</td>
                  <td>{row.kinds.map(kindLabel).join(', ')}</td>
                  <td>
                    <Badge tone={row.active ? 'positive' : 'default'}>{row.active ? 'Đang hoạt động' : 'Đã vô hiệu hoá'}</Badge> <Badge>{row.bound ? 'Đã đăng nhập lần đầu' : 'Chưa đăng nhập'}</Badge>
                  </td>
                  <td>{formatTime(row.last_login_at)}</td>
                  <td>
                    <Flex gap={2} wrap="wrap">
                      <Button
                        text={row.active ? 'Vô hiệu hoá' : 'Kích hoạt'}
                        mode="ghost"
                        tone={row.active ? 'critical' : 'positive'}
                        fontSize={1}
                        disabled={busy}
                        aria-label={`${row.active ? 'Vô hiệu hoá' : 'Kích hoạt'} ${row.email}`}
                        onClick={() => void run('staff.setActive', { email: row.email, active: !row.active }, row.active ? 'Đã vô hiệu hoá: người này mất quyền ngay ở lần thao tác tiếp theo.' : 'Đã kích hoạt.')}
                      />
                      <Button
                        text="Đặt lại liên kết đăng nhập"
                        mode="ghost"
                        fontSize={1}
                        disabled={busy || !row.bound}
                        aria-label={`Đặt lại liên kết đăng nhập của ${row.email}`}
                        onClick={() => void run('staff.upsert', { email: row.email, role: row.role, kinds: row.kinds, reset: true }, 'Đã đặt lại. Người dùng (hoặc tài khoản Sanity mới) sẽ liên kết lại ở lần đăng nhập tiếp theo.')}
                      />
                    </Flex>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      ) : null}
    </Page>
  );
}
