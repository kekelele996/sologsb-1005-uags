import { Injectable, OnDestroy } from '@angular/core'
import { BehaviorSubject, map, type Observable } from 'rxjs'
import type {
  Annotation, Claim, ClaimVersion, DefectType, Feature, OfficeAction, OfficeActionItem,
  Paragraph, Position, ReplyStatus, Role, ValidationIssue, WorkbenchState
} from './models'

const STORAGE_KEY = 'patent-claim-mapping-workbench-v1'
const POSITION_KEY = 'patent-claim-mapping-position-v1'

const initialClaims: Claim[] = [
  { id: 'claim-1', number: 1, title: '一种自适应展柜环境控制装置', independent: true, text: '一种自适应展柜环境控制装置，包括：柜体；环境传感模块，设置于所述柜体内并用于采集温湿度数据；以及控制模块，与所述环境传感模块通信，并根据所述温湿度数据调节所述柜体的微环境。' },
  { id: 'claim-2', number: 2, title: '传感模块的布置方式', independent: false, text: '根据权利要求1所述的装置，其特征在于，所述环境传感模块包括沿所述柜体对角线布置的多个温湿度传感器。' },
  { id: 'claim-3', number: 3, title: '控制模块的调节策略', independent: false, text: '根据权利要求1所述的装置，其特征在于，所述控制模块基于历史数据与当前数据之间的偏差分级调节除湿单元。' }
]
const initialParagraphs: Paragraph[] = [
  { id: 'para-0012', section: '说明书 [0012]', text: '柜体1形成用于陈列文物的封闭空间。环境传感模块2安装于柜体内部，可采集温度、相对湿度等环境数据，并将数据发送至控制模块3。' },
  { id: 'para-0018', section: '说明书 [0018]', text: '在一种实施方式中，多个温湿度传感器沿柜体对角线布置，由此可降低局部气流造成的测量偏差。传感器数量可根据柜体容积设定。' },
  { id: 'para-0024', section: '说明书 [0024]', text: '控制模块可比较当前湿度与预设区间，并结合历史变化趋势生成调节等级。当偏差持续超过阈值时，控制模块启动除湿单元并提高调节频率。' },
  { id: 'para-0031', section: '说明书 [0031]', text: '控制模块与传感模块之间可以采用有线或无线通信。通信链路可周期传输数据，传输周期例如为十秒至五分钟。' },
  { id: 'para-0040', section: '说明书 [0040]', text: '微环境调节包括湿度调节、温度调节及气体交换。控制策略可记录执行结果，用于后续趋势判断。' }
]
const initialFeatures: Feature[] = [
  { id: 'feature-a', claimId: 'claim-1', label: 'A · 柜体', text: '柜体', parentId: null, referenceIds: [], supportIds: ['para-0012'], ownerRole: 'author' },
  { id: 'feature-b', claimId: 'claim-1', label: 'B · 环境传感模块', text: '设置于柜体内，用于采集温湿度数据', parentId: 'feature-a', referenceIds: [], supportIds: ['para-0012', 'para-0018'], ownerRole: 'author' },
  { id: 'feature-c', claimId: 'claim-1', label: 'C · 控制模块通信', text: '与环境传感模块通信', parentId: 'feature-a', referenceIds: ['feature-b'], supportIds: ['para-0012', 'para-0031'], ownerRole: 'author' },
  { id: 'feature-d', claimId: 'claim-1', label: 'D · 调节微环境', text: '根据温湿度数据调节柜体微环境', parentId: null, referenceIds: ['feature-b', 'feature-c'], supportIds: ['para-0024', 'para-0040'], ownerRole: 'author' },
  { id: 'feature-e', claimId: 'claim-2', label: 'E · 对角线布置', text: '多个温湿度传感器沿柜体对角线布置', parentId: null, referenceIds: [], supportIds: ['para-0018'], ownerRole: 'author' },
  { id: 'feature-f', claimId: 'claim-3', label: 'F · 分级调节', text: '基于历史数据与当前数据的偏差分级调节除湿单元', parentId: null, referenceIds: [], supportIds: ['para-0024'], ownerRole: 'author' }
]
const initialAnnotations: Annotation[] = [
  { id: 'annotation-1', featureId: 'feature-b', authorRole: 'examiner', authorName: '审查员 · 李岚', text: '“温湿度数据”是否包括露点等派生数据？建议在从属权利要求中限定。', updatedAt: '2026-09-24T03:10:00.000Z' },
  { id: 'annotation-2', featureId: 'feature-d', authorRole: 'author', authorName: '代理人 · 陈昊', text: '[0024] 已支持分级调节，发布前补充除湿单元与通信模块的连接关系。', updatedAt: '2026-09-24T04:05:00.000Z' }
]

/** 演示用首次审查意见：两条能对上、一条对不上（进入待认领） */
const initialOfficeAction: OfficeAction = {
  id: 'office-action-1',
  remoteId: 'OA-CN-2026-0917-1',
  title: '第一次审查意见通知书',
  receivedAt: '2026-09-26T02:00:00.000Z',
  export: null,
  items: [
    {
      id: 'oa-item-1', createdAt: '2026-09-26T02:00:00.000Z', updatedAt: '2026-09-26T02:00:00.000Z',
      examiner: { remoteKey: 'OA1-1', defectNo: '1', defectType: 'clarity', opinionText: '权利要求1中“温湿度数据”的含义不清楚，未说明是否包含露点等派生数据，不符合专利法第26条第4款。', conclusion: '认定不清楚，需修改或说明。', suggestedClaimNumber: 1, suggestedFeatureLabel: 'B · 环境传感模块' },
      workbench: { claimId: 'claim-1', featureId: 'feature-b', replyMode: null, replyText: '', basisSupportIds: [], baselineFeatureText: '设置于柜体内，用于采集温湿度数据', conclusionStale: false, finalized: false }
    },
    {
      id: 'oa-item-2', createdAt: '2026-09-26T02:00:00.000Z', updatedAt: '2026-09-26T02:00:00.000Z',
      examiner: { remoteKey: 'OA1-2', defectNo: '2', defectType: 'inventive-step', opinionText: '权利要求3相对于对比文件D1与公知常识的结合不具备创造性，“分级调节”的阈值与等级未具体限定。', conclusion: '初步否定创造性。', suggestedClaimNumber: 3, suggestedFeatureLabel: 'F · 分级调节' },
      workbench: { claimId: 'claim-3', featureId: 'feature-f', replyMode: 'argue', replyText: '[0024] 记载了“结合历史变化趋势生成调节等级”，分级判断并非公知常识，D1未公开历史趋势反馈。', basisSupportIds: ['para-0024'], baselineFeatureText: '基于历史数据与当前数据的偏差分级调节除湿单元', conclusionStale: false, finalized: false }
    },
    {
      id: 'oa-item-3', createdAt: '2026-09-26T02:00:00.000Z', updatedAt: '2026-09-26T02:00:00.000Z',
      examiner: { remoteKey: 'OA1-3', defectNo: '3', defectType: 'formal', opinionText: '权利要求4引用关系存疑：案卷中未检索到该项权利要求（以本次送审版本核对）。', conclusion: '形式缺陷，待确认指向。', suggestedClaimNumber: 4, suggestedFeatureLabel: null },
      workbench: { claimId: null, featureId: null, replyMode: null, replyText: '', basisSupportIds: [], baselineFeatureText: null, conclusionStale: false, finalized: false }
    }
  ]
}

function demoState(): WorkbenchState {
  return {
    claims: initialClaims, paragraphs: initialParagraphs, features: initialFeatures,
    annotations: initialAnnotations, orphanMappings: [], versions: [],
    officeActions: [structuredClone(initialOfficeAction)],
    role: 'author', currentUserRole: 'author', selectedClaimId: 'claim-1', selectedFeatureId: 'feature-b', activeTab: 'mapping'
  }
}
function clone<T>(value: T): T { return structuredClone(value) }

@Injectable({ providedIn: 'root' })
export class WorkbenchService implements OnDestroy {
  private readonly initialState = this.loadState()
  private readonly stateSubject = new BehaviorSubject<WorkbenchState>(this.initialState)
  private readonly historySubject = new BehaviorSubject<{ past: number; future: number }>({ past: 0, future: 0 })
  private past: WorkbenchState[] = []
  private future: WorkbenchState[] = []

  readonly state$ = this.stateSubject.asObservable()
  readonly history$ = this.historySubject.asObservable()
  readonly claims$ = this.state$.pipe(map(state => state.claims))
  readonly paragraphs$ = this.state$.pipe(map(state => state.paragraphs))
  readonly features$ = this.state$.pipe(map(state => state.features))
  readonly annotations$ = this.state$.pipe(map(state => state.annotations))
  readonly role$ = this.state$.pipe(map(state => state.role))
  readonly selectedClaim$ = this.state$.pipe(map(state => state.claims.find(claim => claim.id === state.selectedClaimId) || state.claims[0]))
  readonly selectedFeature$ = this.state$.pipe(map(state => state.features.find(feature => feature.id === state.selectedFeatureId) || null))
  readonly issues$ = this.state$.pipe(map(state => this.validate(state)))

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => this.savePosition())
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', () => this.savePosition())
  }

  get snapshot(): WorkbenchState { return clone(this.stateSubject.value) }
  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  selectClaim(id: string): void {
    this.patchState(state => { state.selectedClaimId = id; state.selectedFeatureId = state.features.find(feature => feature.claimId === id)?.id || null })
    this.savePosition()
  }

  selectFeature(id: string | null): void {
    this.patchState(state => { state.selectedFeatureId = id })
    this.savePosition()
  }

  setRole(role: Role): void {
    this.patchState(state => { state.role = role; state.currentUserRole = role })
  }

  setTab(tab: string): void {
    this.patchState(state => { state.activeTab = tab })
    this.savePosition()
  }

  updateClaim(patch: Partial<Claim>): void {
    this.commit(state => {
      const claim = state.claims.find(item => item.id === state.selectedClaimId)
      if (claim) Object.assign(claim, patch)
    })
  }

  addClaim(): void {
    this.commit(state => {
      const number = Math.max(0, ...state.claims.map(claim => claim.number)) + 1
      const claim: Claim = { id: `claim-${Date.now()}`, number, title: `权利要求 ${number}`, independent: false, text: '请录入权利要求正文。' }
      state.claims.push(claim)
      state.selectedClaimId = claim.id
      state.selectedFeatureId = null
    })
  }

  addParagraph(): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const next = state.paragraphs.length + 1
      state.paragraphs.push({ id: `para-${Date.now()}`, section: `说明书 [${String(next * 5).padStart(4, '0')}]`, text: '' })
    })
  }

  updateParagraph(id: string, patch: Partial<Paragraph>): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const paragraph = state.paragraphs.find(item => item.id === id)
      if (paragraph) Object.assign(paragraph, patch)
    })
  }

  deleteParagraph(id: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      state.paragraphs = state.paragraphs.filter(item => item.id !== id)
      state.features.forEach(feature => { feature.supportIds = feature.supportIds.filter(paragraphId => paragraphId !== id) })
      state.orphanMappings = state.orphanMappings.filter(item => item.paragraphId !== id)
    })
  }

  addFeature(): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature: Feature = {
        id: `feature-${Date.now()}`, claimId: state.selectedClaimId,
        label: `新特征 ${state.features.filter(item => item.claimId === state.selectedClaimId).length + 1}`,
        text: '', parentId: null, referenceIds: [], supportIds: [], ownerRole: state.role
      }
      state.features.push(feature)
      state.selectedFeatureId = feature.id
    })
  }

  updateFeature(id: string, patch: Partial<Feature>): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === id)
      if (feature) Object.assign(feature, patch)
    })
  }

  deleteFeature(id: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === id)
      if (!feature) return
      feature.supportIds.forEach(paragraphId => state.orphanMappings.push({
        id: `orphan-${Date.now()}-${paragraphId}`, featureLabel: feature.label, paragraphId,
        reason: `技术特征“${feature.label}”已删除，但支持段落映射仍被保留。`
      }))
      state.features = state.features.filter(item => item.id !== id)
      state.features.forEach(item => {
        item.referenceIds = item.referenceIds.filter(refId => refId !== id)
        if (item.parentId === id) item.parentId = null
      })
      state.annotations = state.annotations.filter(item => item.featureId !== id)
      state.selectedFeatureId = state.features.find(item => item.claimId === state.selectedClaimId)?.id || null
    })
  }

  toggleParagraphMapping(featureId: string, paragraphId: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === featureId)
      if (!feature) return
      const index = feature.supportIds.indexOf(paragraphId)
      if (index >= 0) feature.supportIds.splice(index, 1)
      else feature.supportIds.push(paragraphId)
      state.orphanMappings = state.orphanMappings.filter(item => item.paragraphId !== paragraphId)
    })
  }

  clearOrphan(id: string): void {
    this.commit(state => { state.orphanMappings = state.orphanMappings.filter(item => item.id !== id) })
  }

  addAnnotation(featureId: string, text: string): void {
    const trimmed = text.trim()
    if (!trimmed) return
    const role = this.stateSubject.value.role
    const names: Record<Role, string> = { author: '代理人 · 陈昊', examiner: '审查员 · 李岚', viewer: '观察者' }
    this.commit(state => state.annotations.push({
      id: `annotation-${Date.now()}`, featureId, authorRole: role, authorName: names[role], text: trimmed, updatedAt: new Date().toISOString()
    }))
  }

  updateAnnotation(id: string, text: string): void {
    this.commit(state => {
      const annotation = state.annotations.find(item => item.id === id)
      if (annotation && annotation.authorRole === state.role) annotation.text = text
    })
  }

  deleteAnnotation(id: string): void {
    this.commit(state => {
      const annotation = state.annotations.find(item => item.id === id)
      if (annotation && annotation.authorRole === state.role) state.annotations = state.annotations.filter(item => item.id !== id)
    })
  }

  createVersion(name?: string): void {
    this.commit(state => {
      state.versions.unshift({
        id: `version-${Date.now()}`, name: name?.trim() || `快照 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
        createdAt: new Date().toISOString(), claims: clone(state.claims), features: clone(state.features)
      })
    })
  }

  restoreVersion(id: string): void {
    this.commit(state => {
      const version = state.versions.find(item => item.id === id)
      if (!version) return
      state.claims = clone(version.claims)
      state.features = clone(version.features)
      if (!state.claims.some(claim => claim.id === state.selectedClaimId)) state.selectedClaimId = state.claims[0]?.id || ''
      state.selectedFeatureId = state.features.find(feature => feature.claimId === state.selectedClaimId)?.id || null
    })
  }

  // ── 审查意见送达与对账 ──────────────────────────────────────────────

  /** 审查员侧送达：同 remoteId 的意见不重复建；同 remoteKey 的条目文字按审查意见覆盖，答复侧保留 */
  ingestOfficeAction(input: { remoteId: string; title: string; items: Array<{ remoteKey: string; defectNo: string; defectType: DefectType; opinionText: string; conclusion: string; suggestedClaimNumber: number | null; suggestedFeatureLabel: string | null }> }): { actionId: string; created: boolean; matched: number; unclaimed: number } {
    const result = { actionId: '', created: false, matched: 0, unclaimed: 0 }
    // 送达是审查员侧动作；观察者只读
    if (this.stateSubject.value.role !== 'examiner') return result
    this.commit(state => {
      let action = state.officeActions.find(item => item.remoteId === input.remoteId)
      if (!action) {
        action = { id: `office-action-${Date.now()}`, remoteId: input.remoteId, title: input.title.trim() || '审查意见', receivedAt: new Date().toISOString(), items: [], export: null }
        state.officeActions.push(action)
        result.created = true
      }
      for (const incoming of input.items) {
        const existing = action.items.find(item => item.examiner.remoteKey === incoming.remoteKey)
        if (existing) {
          // 两边同一条目都动过：条目文字按审查意见算
          existing.examiner = clone(incoming)
          existing.updatedAt = new Date().toISOString()
          continue
        }
        const match = this.autoMatch(incoming, state.claims, state.features)
        const feature = match ? state.features.find(item => item.id === match.featureId) : null
        const item: OfficeActionItem = {
          id: `oa-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          examiner: clone(incoming),
          workbench: {
            claimId: match?.claimId || null,
            featureId: match?.featureId || null,
            replyMode: null, replyText: '', basisSupportIds: [],
            baselineFeatureText: feature ? feature.text : null,
            conclusionStale: false, finalized: false
          },
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        }
        action.items.push(item)
        feature ? result.matched++ : result.unclaimed++
      }
      result.actionId = action.id
    })
    return result
  }

  /** 对账失败后重试：只补还没对上的待认领条目，已对上的条目不动 */
  rematchUnclaimed(actionId: string): number {
    let matchedCount = 0
    this.commit(state => {
      const action = state.officeActions.find(item => item.id === actionId)
      if (!action) return
      for (const item of action.items) {
        if (item.workbench.claimId) continue
        const match = this.autoMatch(item.examiner, state.claims, state.features)
        if (!match) continue
        const feature = state.features.find(feat => feat.id === match.featureId)
        item.workbench.claimId = match.claimId
        item.workbench.featureId = match.featureId
        item.workbench.baselineFeatureText = feature ? feature.text : null
        item.updatedAt = new Date().toISOString()
        matchedCount++
      }
    })
    return matchedCount
  }

  /** 代理人手动认领待认领条目；重新认领以当前特征正文为基线，并使审查员旧结论失效 */
  claimItem(actionId: string, itemId: string, claimId: string, featureId: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const item = this.findItem(state, actionId, itemId)
      const feature = state.features.find(feat => feat.id === featureId && feat.claimId === claimId)
      if (!item || !feature) return
      const moved = item.workbench.featureId !== null && item.workbench.featureId !== featureId
      item.workbench.claimId = claimId
      item.workbench.featureId = featureId
      item.workbench.baselineFeatureText = feature.text
      if (moved || item.workbench.conclusionStale) item.workbench.conclusionStale = true
      item.workbench.finalized = false
      item.updatedAt = new Date().toISOString()
    })
  }

  /** 退回待认领：答复记录保留，条目重新等待对账 */
  releaseItem(actionId: string, itemId: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const item = this.findItem(state, actionId, itemId)
      if (!item) return
      item.workbench.claimId = null
      item.workbench.featureId = null
      item.workbench.baselineFeatureText = null
      item.workbench.finalized = false
      item.updatedAt = new Date().toISOString()
    })
  }

  /** 代理人逐条答复：要么改那条特征，要么只讲理由 */
  saveReply(actionId: string, itemId: string, reply: { mode: 'amend' | 'argue'; text: string; basisSupportIds: string[] }): boolean {
    if (this.stateSubject.value.role === 'viewer') return false
    let saved = false
    this.commit(state => {
      const item = this.findItem(state, actionId, itemId)
      if (!item || !item.workbench.featureId) return
      const feature = state.features.find(feat => feat.id === item.workbench.featureId)
      if (!feature) return
      // 标成“已改”的必须指到这次确实动过的特征；特征后来被改回则不成立
      if (reply.mode === 'amend' && feature.text === item.workbench.baselineFeatureText) return
      item.workbench.replyMode = reply.mode
      item.workbench.replyText = reply.text.trim()
      item.workbench.basisSupportIds = reply.basisSupportIds.filter(id => state.paragraphs.some(paragraph => paragraph.id === id))
      item.workbench.finalized = false
      item.updatedAt = new Date().toISOString()
      saved = true
    })
    return saved
  }

  /** 审查员对答复给出结论；特征一改动，定过的结论即失效（由 commit 后比对自动置 stale） */
  saveExaminerConclusion(actionId: string, itemId: string, conclusion: string): void {
    if (this.stateSubject.value.role !== 'examiner') return
    this.commit(state => {
      const item = this.findItem(state, actionId, itemId)
      if (!item) return
      item.examiner.conclusion = conclusion.trim()
      item.workbench.conclusionStale = false
      item.updatedAt = new Date().toISOString()
    })
  }

  itemStatus(item: OfficeActionItem, features: Feature[]): { status: ReplyStatus; reason: string } {
    if (!item.workbench.claimId || !item.workbench.featureId) return { status: 'unclaimed', reason: '未对上权利要求/特征，待认领' }
    const feature = features.find(feat => feat.id === item.workbench.featureId)
    if (!feature) return { status: 'incomplete', reason: '所指特征已撤掉，答复退回未完成' }
    const wb = item.workbench
    if (!wb.replyMode || !wb.replyText) return { status: 'incomplete', reason: '代理人尚未答复' }
    if (wb.replyMode === 'amend' && feature.text === wb.baselineFeatureText) {
      return { status: 'incomplete', reason: '标为“已改”，但该特征已改回原文或未实际修改' }
    }
    if (wb.replyMode === 'argue' && !wb.basisSupportIds.length) return { status: 'incomplete', reason: '陈述理由需指明说明书依据' }
    return { status: 'complete', reason: wb.conclusionStale ? '特征已改动，审查员先前结论失效，待重新认定' : '答复齐备' }
  }

  /** 条目都对上、答复齐了才能定稿导出对照表（代理人侧动作） */
  finalizeOfficeAction(actionId: string): { ok: boolean; reason: string } {
    if (this.stateSubject.value.role !== 'author') return { ok: false, reason: '定稿导出由代理人执行' }
    const state = this.stateSubject.value
    const action = state.officeActions.find(item => item.id === actionId)
    if (!action) return { ok: false, reason: '未找到该审查意见' }
    if (!action.items.length) return { ok: false, reason: '意见内还没有缺陷条目' }
    const pending = action.items.filter(item => this.itemStatus(item, state.features).status !== 'complete')
    if (pending.length) return { ok: false, reason: `仍有 ${pending.length} 条未对上或答复未完成，不能定稿` }
    const csv = this.buildReconciliationCsv(action, state)
    this.commit(next => {
      const target = next.officeActions.find(item => item.id === actionId)
      if (!target) return
      const finalizedAt = new Date().toISOString()
      target.items.forEach(item => { item.workbench.finalized = true })
      target.export = { finalizedAt, csv }
    })
    return { ok: true, reason: '对照表已定稿' }
  }

  reconciliationCsv(action: OfficeAction): string {
    return this.buildReconciliationCsv(action, this.stateSubject.value)
  }

  // ── 撤销重做 ────────────────────────────────────────────────────────
  undo(): void {
    const previous = this.past.pop()
    if (!previous) return
    this.future.push(clone(this.stateSubject.value))
    this.stateSubject.next(previous)
    this.updateHistory()
    this.saveState()
  }

  redo(): void {
    const next = this.future.pop()
    if (!next) return
    this.past.push(clone(this.stateSubject.value))
    this.stateSubject.next(next)
    this.updateHistory()
    this.saveState()
  }

  savePosition(): void {
    if (typeof localStorage === 'undefined') return
    const state = this.stateSubject.value
    const position: Position = { tab: state.activeTab, claimId: state.selectedClaimId, featureId: state.selectedFeatureId, scrollY: window.scrollY }
    localStorage.setItem(POSITION_KEY, JSON.stringify(position))
    this.saveState()
  }

  readPosition(): Position {
    if (typeof localStorage === 'undefined') return { tab: this.initialState.activeTab, claimId: this.initialState.selectedClaimId, featureId: this.initialState.selectedFeatureId, scrollY: 0 }
    try { return { ...JSON.parse(localStorage.getItem(POSITION_KEY) || '{}'), ...this.stateSubject.value } } catch { return { tab: 'mapping', claimId: this.initialState.selectedClaimId, featureId: this.initialState.selectedFeatureId, scrollY: 0 } }
  }

  exportJson(): string { return JSON.stringify({ ...this.snapshot, validationIssues: this.validate(this.stateSubject.value) }, null, 2) }

  exportCsv(): string {
    const state = this.stateSubject.value
    const rows = state.features.map(feature => [
      state.claims.find(claim => claim.id === feature.claimId)?.number || '', feature.label, feature.text,
      state.features.find(item => item.id === feature.parentId)?.label || '',
      feature.referenceIds.map(id => state.features.find(item => item.id === id)?.label || id).join('；'),
      feature.supportIds.map(id => state.paragraphs.find(item => item.id === id)?.section || id).join('；')
    ])
    const csv = [['权利要求', '技术特征', '特征内容', '父级特征', '引用特征', '支持段落'], ...rows]
      .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    return `\uFEFF${csv}`
  }

  validate(state = this.stateSubject.value): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    for (const feature of state.features) {
      if (!feature.text.trim()) issues.push({ id: `empty-${feature.id}`, severity: 'warning', type: 'empty-feature', featureId: feature.id, title: `${feature.label} 内容为空`, detail: '请补全技术特征文字，避免映射对象不明确。' })
      if (!feature.supportIds.length) issues.push({ id: `support-${feature.id}`, severity: 'error', type: 'missing-support', featureId: feature.id, title: `${feature.label} 缺少说明书依据`, detail: '至少为一个说明书段落建立支持映射。' })
      if (this.hasReferenceCycle(feature, state.features)) issues.push({ id: `cycle-${feature.id}`, severity: 'error', type: 'cycle', featureId: feature.id, title: `${feature.label} 存在循环引用`, detail: '特征层级或引用关系形成闭环，请移除其中一条关系。' })
    }
    state.orphanMappings.forEach(item => issues.push({ id: item.id, severity: 'warning', type: 'orphan-mapping', title: '存在待清理映射', detail: item.reason }))
    return issues
  }

  private hasReferenceCycle(start: Feature, features: Feature[]): boolean {
    const visited = new Set<string>()
    const visit = (id: string): boolean => {
      if (id === start.id && visited.size > 0) return true
      if (visited.has(id)) return false
      visited.add(id)
      const feature = features.find(item => item.id === id)
      if (!feature) return false
      if (feature.parentId && visit(feature.parentId)) return true
      return feature.referenceIds.some(visit)
    }
    return visit(start.id)
  }

  private findItem(state: WorkbenchState, actionId: string, itemId: string): OfficeActionItem | undefined {
    return state.officeActions.find(action => action.id === actionId)?.items.find(item => item.id === itemId)
  }

  /** 按审查意见中的权利要求号 + 特征标签自动对账；对不上就留给待认领 */
  private autoMatch(
    examiner: { suggestedClaimNumber: number | null; suggestedFeatureLabel: string | null },
    claims: Claim[], features: Feature[]
  ): { claimId: string; featureId: string } | null {
    if (examiner.suggestedClaimNumber == null || !examiner.suggestedFeatureLabel) return null
    const claim = claims.find(item => item.number === examiner.suggestedClaimNumber)
    if (!claim) return null
    const wanted = examiner.suggestedFeatureLabel.replace(/\s+/g, '')
    const candidates = features.filter(item => item.claimId === claim.id)
    const feature = candidates.find(item => item.label.replace(/\s+/g, '') === wanted)
      || candidates.find(item => item.label.replace(/\s+/g, '').includes(wanted) || wanted.includes(item.label.replace(/\s+/g, '')))
    return feature ? { claimId: claim.id, featureId: feature.id } : null
  }

  private csvCell(value: string): string {
    return `"${value.replaceAll('"', '""')}"`
  }

  private buildReconciliationCsv(action: OfficeAction, state: WorkbenchState): string {
    const defectLabels: Record<DefectType, string> = {
      novelty: '新颖性', 'inventive-step': '创造性', clarity: '清楚性', support: '支持/公开充分', formal: '形式缺陷', other: '其他'
    }
    const rows = action.items.map(item => {
      const claim = state.claims.find(c => c.id === item.workbench.claimId)
      const feature = state.features.find(f => f.id === item.workbench.featureId)
      const status = this.itemStatus(item, state.features)
      return [
        item.examiner.defectNo,
        defectLabels[item.examiner.defectType] || item.examiner.defectType,
        item.examiner.opinionText,
        claim ? `权利要求${claim.number}` : '（待认领）',
        feature?.label || '（待认领）',
        item.workbench.replyMode === 'amend' ? '已修改特征' : item.workbench.replyMode === 'argue' ? '陈述理由' : '未答复',
        item.workbench.replyText,
        item.workbench.basisSupportIds.map(id => state.paragraphs.find(p => p.id === id)?.section || id).join('；'),
        item.workbench.conclusionStale ? `${item.examiner.conclusion}（特征已改动，该结论失效）` : item.examiner.conclusion,
        status.status === 'complete' ? '答复齐备' : status.status === 'unclaimed' ? '待认领' : `未完成：${status.reason}`
      ].map(value => this.csvCell(String(value ?? ''))).join(',')
    })
    const header = ['缺陷编号', '缺陷类型', '审查意见原文', '权利要求', '技术特征', '答复方式', '答复意见/修改说明', '说明书依据', '审查员结论', '对账状态']
      .map(value => this.csvCell(value)).join(',')
    return `﻿${[header, ...rows].join('\n')}`
  }

  private commit(recipe: (state: WorkbenchState) => void): void {
    const current = clone(this.stateSubject.value)
    const next = clone(current)
    recipe(next)
    this.invalidateChangedFeatureConclusions(current, next)
    this.past.push(current)
    if (this.past.length > 60) this.past.shift()
    this.future = []
    this.stateSubject.next(next)
    this.updateHistory()
    this.saveState()
  }

  /** 特征一改动（正文被修改或特征被删除），挂在它上面的审查员结论即失效；其余特征照旧 */
  private invalidateChangedFeatureConclusions(before: WorkbenchState, after: WorkbenchState): void {
    const changedIds = new Set<string>()
    before.features.forEach(previous => {
      const updated = after.features.find(feature => feature.id === previous.id)
      if (!updated || updated.text !== previous.text) changedIds.add(previous.id)
    })
    if (!changedIds.size) return
    after.officeActions.forEach(action => {
      let touched = false
      action.items.forEach(item => {
        if (item.workbench.featureId && changedIds.has(item.workbench.featureId) && !item.workbench.conclusionStale) {
          item.workbench.conclusionStale = true
          item.workbench.finalized = false
          touched = true
        }
      })
      if (touched && action.export) action.export = null
    })
  }

  private patchState(recipe: (state: WorkbenchState) => void): void {
    const next = clone(this.stateSubject.value)
    recipe(next)
    this.stateSubject.next(next)
    this.saveState()
  }

  private updateHistory(): void { this.historySubject.next({ past: this.past.length, future: this.future.length }) }
  private saveState(): void { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stateSubject.value)) }
  private loadState(): WorkbenchState {
    if (typeof localStorage === 'undefined') return demoState()
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? { ...demoState(), ...JSON.parse(stored) } : demoState()
    } catch { return demoState() }
  }
}
