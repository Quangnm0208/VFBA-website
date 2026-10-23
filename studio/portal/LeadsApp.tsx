import { Badge, Button, Card, Flex, Grid, Heading, Select, Stack, Text, TextArea, TextInput } from '@sanity/ui';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Api, Me } from './api';
import { errorText, formatTime, KINDS, kindLabel, roleLabel, STATUSES, statusLabel, statusTone, WORKFLOW } from './labels';
import { Alert, BetaNote, Field, Loading, Notice, Page, Pre, TableBox } from './ui';

interface Row {
  id: string;
  kind: string;
  name: string | null;
  company: string | null;
  email: string;
  status: string;
  source_path: string;
  consent_at: string;
  created_at: string;
  notes: number;
}
interface ListData {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
}
interface LeadDetail {
  lead: {
    id: string;
    kind: string;
    name: string | null;
    company: string | null;
    email: string;
    phone: string | null;
    interest: string | null;
    message: string | null;
    consent: boolean;
    consent_text_version: string;
    consent_at: string;
    source_path: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  notes: Array<{ id: string; author_email: string; body: string; created_at: string }>;
}
interface Filters {
  kind: string;
  status: string;
  from: string;
  to: string;
  q: string;
}
const NO_FILTERS: Filters = { kind: '', status: '', from: '', to: '', q: '' };

export function LeadsApp({ api, me }: { api: Api; me: Me }) {
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ListData | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState('');
  const detailHeading = useRef<HTMLHeadingElement | null>(null);
  const listSeq = useRef(0);

  const loadList = useCallback(async () => {
    const seq = ++listSeq.current;
    setLoading(true);
    const result = await api.call<ListData>('leads.list', { ...applied, page });
    if (seq !== listSeq.current) return; // an older answer must never overwrite a newer one
    setLoading(false);
    if (result.ok) {
      setList(result.data);
      setListError(null);
      // The last page can disappear after a status filter: step back instead of showing an empty page.
      if (result.data.rows.length === 0 && page > 1) setPage(1);
    } else setListError(errorText(result.code, result.status));
  }, [api, applied, page]);
  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(
    // `keepError`: after an action that failed, reloading shows what is true now but must not erase the explanation of the failure.
    async (id: string, focus = false, keepError = false) => {
      const result = await api.call<LeadDetail>('leads.get', { id });
      if (result.ok) {
        setDetail(result.data);
        if (!keepError) setDetailError(null);
        if (focus) setTimeout(() => detailHeading.current?.focus(), 0);
      } else {
        setDetail(null);
        setDetailError(errorText(result.code, result.status));
      }
    },
    [api],
  );
  const open = (id: string) => {
    setSelected(id);
    setNotice(null);
    setNoteText('');
    void loadDetail(id, true);
  };
  const close = () => {
    setSelected(null);
    setDetail(null);
    setDetailError(null);
    setNotice(null);
  };

  const apply = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied({ ...draft, q: draft.q.trim() });
  };
  const clear = () => {
    setDraft(NO_FILTERS);
    setApplied(NO_FILTERS);
    setPage(1);
  };

  const changeStatus = async (to: string) => {
    if (!detail || busy) return;
    setBusy(true);
    setNotice(null);
    const result = await api.call('leads.status', { id: detail.lead.id, from: detail.lead.status, to });
    setBusy(false);
    if (result.ok) setNotice(`Đã chuyển sang “${statusLabel(to)}”.`);
    setDetailError(result.ok ? null : errorText(result.code, result.status));
    await Promise.all([loadDetail(detail.lead.id, false, !result.ok), loadList()]); // also after a conflict: show what is true now, and why nothing happened
  };
  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || busy) return;
    setBusy(true);
    setNotice(null);
    const result = await api.call('leads.note', { id: detail.lead.id, body: noteText });
    setBusy(false);
    if (result.ok) {
      setNoteText('');
      setNotice('Đã lưu ghi chú.');
      setDetailError(null);
      await Promise.all([loadDetail(detail.lead.id), loadList()]);
    } else setDetailError(errorText(result.code, result.status));
  };

  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const first = list && list.total > 0 ? (list.page - 1) * list.pageSize + 1 : 0;
  const last = list ? Math.min(list.total, list.page * list.pageSize) : 0;
  const noteLength = Array.from(noteText.trim()).length;

  return (
    <Page>
      <BetaNote />
      <Stack gap={2}>
        <Heading as="h1" size={3}>
          Quản lý Lead
        </Heading>
        <Text size={1} muted>
          Đăng nhập: {me.email} · {roleLabel(me.role)} · phạm vi: {me.kinds.map(kindLabel).join(', ')}
        </Text>
      </Stack>

      <Card padding={3} radius={2} border as="form" onSubmit={apply} aria-label="Bộ lọc">
        <Stack gap={4}>
          <Grid gridTemplateColumns={[1, 2, 3, 5]} gap={3}>
            <Field id="f-kind" label="Loại">
              <Select id="f-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.currentTarget.value })}>
                <option value="">Tất cả</option>
                {KINDS.filter((k) => me.kinds.includes(k.value)).map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="f-status" label="Trạng thái">
              <Select id="f-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.currentTarget.value })}>
                <option value="">Tất cả</option>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="f-from" label="Từ ngày">
              <TextInput id="f-from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            </Field>
            <Field id="f-to" label="Đến ngày">
              <TextInput id="f-to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
            </Field>
            <Field id="f-q" label="Tìm (tên, email, công ty)">
              <TextInput id="f-q" type="search" maxLength={100} value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.currentTarget.value })} />
            </Field>
          </Grid>
          <Flex gap={2} wrap="wrap">
            <Button type="submit" text="Lọc" />
            <Button type="button" text="Xoá bộ lọc" mode="ghost" onClick={clear} />
            <Button type="button" text="Tải lại" mode="ghost" onClick={() => void loadList()} />
          </Flex>
        </Stack>
      </Card>

      {listError ? <Alert>{listError}</Alert> : null}
      {loading && !list ? <Loading label="Đang tải danh sách…" /> : null}
      {list ? (
        <Stack gap={3}>
          <Text size={1} aria-live="polite" role="status">
            {list.total === 0 ? 'Không có khách nào khớp bộ lọc.' : `Hiển thị ${first}–${last} / ${list.total} khách`}
            {loading ? ' · đang tải…' : ''}
          </Text>
          {list.rows.length > 0 ? (
            <TableBox>
              <table>
                <caption>Danh sách khách</caption>
                <thead>
                  <tr>
                    <th scope="col">Thời gian</th>
                    <th scope="col">Loại</th>
                    <th scope="col">Khách</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Ghi chú</th>
                    <th scope="col">
                      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Mở</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => (
                    <tr key={row.id} aria-selected={row.id === selected}>
                      <td>{formatTime(row.created_at)}</td>
                      <td>{kindLabel(row.kind)}</td>
                      <td>
                        <strong>{row.name || row.email}</strong>
                        <br />
                        <span>{row.name ? row.email : ''}</span>
                        {row.company ? <div>{row.company}</div> : null}
                      </td>
                      <td>
                        <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                      </td>
                      <td>{row.notes}</td>
                      <td>
                        <Button text="Mở" mode="ghost" fontSize={1} onClick={() => open(row.id)} aria-label={`Mở chi tiết ${row.name || row.email}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableBox>
          ) : null}
          <Flex gap={2} align="center" wrap="wrap">
            <Button text="‹ Trang trước" mode="ghost" disabled={list.page <= 1 || loading} onClick={() => setPage(list.page - 1)} />
            <Text size={1}>
              Trang {list.page} / {pages}
            </Text>
            <Button text="Trang sau ›" mode="ghost" disabled={list.page >= pages || loading} onClick={() => setPage(list.page + 1)} />
          </Flex>
        </Stack>
      ) : null}

      {selected ? (
        <Card padding={[3, 4]} radius={2} border as="section" aria-labelledby="lead-title">
          <Stack gap={4}>
            <Flex justify="space-between" align="center" gap={3} wrap="wrap">
              <Heading as="h2" size={2} id="lead-title" tabIndex={-1} ref={detailHeading} style={{ outline: 'none' }}>
                Chi tiết khách
              </Heading>
              <Button text="Đóng" mode="ghost" onClick={close} />
            </Flex>
            {notice ? <Notice>{notice}</Notice> : null}
            {detailError ? <Alert>{detailError}</Alert> : null}
            {!detail && !detailError ? <Loading label="Đang tải chi tiết…" /> : null}
            {detail ? (
              <Stack gap={5}>
                <Grid gridTemplateColumns={[1, 1, 2]} gap={4}>
                  <Stack gap={3}>
                    <Data label="Họ tên" value={detail.lead.name} />
                    <Data label="Email" value={detail.lead.email} />
                    <Data label="Điện thoại" value={detail.lead.phone} />
                    <Data label="Tổ chức / Doanh nghiệp" value={detail.lead.company} />
                    <Data label="Loại" value={kindLabel(detail.lead.kind)} />
                    <Data label="Nhu cầu" value={detail.lead.interest} />
                    <Data label="Nội dung" value={detail.lead.message} multiline />
                  </Stack>
                  <Stack gap={3}>
                    <Data label="Đồng ý (consent)" value={detail.lead.consent ? 'Có' : 'Không'} />
                    <Data label="Phiên bản câu đồng ý" value={detail.lead.consent_text_version} />
                    <Data label="Thời điểm đồng ý" value={formatTime(detail.lead.consent_at)} />
                    <Data label="Trang gửi" value={detail.lead.source_path} />
                    <Data label="Tạo lúc" value={formatTime(detail.lead.created_at)} />
                    <Data label="Cập nhật lúc" value={formatTime(detail.lead.updated_at)} />
                  </Stack>
                </Grid>

                <Stack gap={3} as="section" aria-label="Trạng thái">
                  <Heading as="h3" size={1}>
                    Trạng thái
                  </Heading>
                  <Flex gap={3} align="center" wrap="wrap">
                    <Badge tone={statusTone(detail.lead.status)}>{statusLabel(detail.lead.status)}</Badge>
                    {(WORKFLOW as readonly string[]).includes(detail.lead.status)
                      ? WORKFLOW.filter((s) => s !== detail.lead.status).map((s) => (
                          <Button key={s} text={`Chuyển sang “${statusLabel(s)}”`} mode="ghost" disabled={busy} onClick={() => void changeStatus(s)} />
                        ))
                      : null}
                  </Flex>
                  {!(WORKFLOW as readonly string[]).includes(detail.lead.status) ? (
                    <Text size={1} muted>
                      Trạng thái này không đổi được từ cổng quản trị.
                    </Text>
                  ) : null}
                </Stack>

                <Stack gap={3} as="section" aria-label="Ghi chú nội bộ">
                  <Heading as="h3" size={1}>
                    Ghi chú nội bộ ({detail.notes.length})
                  </Heading>
                  {detail.notes.length === 0 ? (
                    <Text size={1} muted>
                      Chưa có ghi chú.
                    </Text>
                  ) : (
                    <Stack gap={2} as="ul" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {detail.notes.map((note) => (
                        <Card key={note.id} as="li" padding={3} radius={2} border>
                          <Stack gap={2}>
                            <Text size={1} muted>
                              {note.author_email} · {formatTime(note.created_at)}
                            </Text>
                            <Text size={1}>
                              <Pre>{note.body}</Pre>
                            </Text>
                          </Stack>
                        </Card>
                      ))}
                    </Stack>
                  )}
                  <Stack gap={3} as="form" onSubmit={addNote}>
                    <Field id="note" label="Thêm ghi chú">
                      <TextArea id="note" rows={4} value={noteText} onChange={(e) => setNoteText(e.currentTarget.value)} />
                    </Field>
                    <Flex gap={3} align="center" wrap="wrap">
                      <Button type="submit" text="Lưu ghi chú" disabled={busy || noteLength < 1 || noteLength > 2000} />
                      <Text size={1} muted>
                        {noteLength}/2000
                      </Text>
                    </Flex>
                  </Stack>
                </Stack>
              </Stack>
            ) : null}
          </Stack>
        </Card>
      ) : null}
    </Page>
  );
}

function Data({ label, value, multiline = false }: { label: string; value: string | null | undefined; multiline?: boolean }) {
  return (
    <Stack gap={1}>
      <Text size={0} muted weight="medium">
        {label}
      </Text>
      <Text size={1}>{multiline && value ? <Pre>{value}</Pre> : value || '—'}</Text>
    </Stack>
  );
}
