import { Injectable, OnDestroy } from '@angular/core'
import { BehaviorSubject, map, type Observable } from 'rxjs'
import type { Annotation, Claim, ClaimVersion, DefectItem, Feature, OfficeAction, Paragraph, Position, ReconcileResult, Response as DefectResponse, Role, ValidationIssue, WorkbenchState } from './models'

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
function demoState(): WorkbenchState {
  return {
    claims: initialClaims, paragraphs: initialParagraphs, features: initialFeatures,
    annotations: initialAnnotations, orphanMappings: [], versions: [], officeActions: [],
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
  readonly officeActions$ = this.state$.pipe(map(state => state.officeActions))

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
      if (feature) {
        Object.assign(feature, patch)
        this.refreshDefectResponseStatusForFeature(state, id)
      }
    })
  }

  deleteFeature(id: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === id)
      if (!feature) return
      feature.supportIds.forEach(paragraphId => state.orphanMappings.push({
        id: `orphan-${Date.now()}-${paragraphId}`, featureLabel: feature.label, paragraphId,
        reason: `技术特征”${feature.label}”已删除，但支持段落映射仍被保留。`
      }))
      state.features = state.features.filter(item => item.id !== id)
      state.features.forEach(item => {
        item.referenceIds = item.referenceIds.filter(refId => refId !== id)
        if (item.parentId === id) item.parentId = null
      })
      state.annotations = state.annotations.filter(item => item.featureId !== id)
      state.selectedFeatureId = state.features.find(item => item.claimId === state.selectedClaimId)?.id || null
      this.refreshDefectResponseStatusForFeature(state, id)
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

  // ── 审查意见管理 ──────────────────────────────────────────────

  getOfficeAction(id: string): OfficeAction | undefined {
    return this.stateSubject.value.officeActions.find(item => item.id === id)
  }

  importOfficeAction(data: { name: string; documentNumber: string; issuedAt: string; items: Array<{ text: string; conclusion?: 'upheld' | 'rejected' | 'pending' }> }): { id: string; duplicated: boolean } {
    const existing = this.stateSubject.value.officeActions.find(item => item.documentNumber === data.documentNumber)
    if (existing) {
      // 同一份意见再送：不重复建，条目文字按审查意见更新，答复和依据按工作台保留
      this.commit(state => {
        const target = state.officeActions.find(item => item.documentNumber === data.documentNumber)
        if (!target) return
        data.items.forEach((incoming, index) => {
          const sequence = index + 1
          const existingItem = target.items.find(item => item.sequence === sequence)
          if (existingItem) {
            existingItem.text = incoming.text
            if (incoming.conclusion) existingItem.conclusion = incoming.conclusion
          } else {
            target.items.push({
              id: `defect-${Date.now()}-${sequence}`, officeActionId: target.id, sequence,
              claimId: null, featureId: null, text: incoming.text,
              conclusion: incoming.conclusion || 'pending', conclusionInvalid: false,
              matched: false, response: null
            })
          }
        })
        // 移除审查意见中已不存在的条目（仅当未匹配时）
        target.items = target.items.filter(item => data.items.some((_, index) => index + 1 === item.sequence))
        target.reconciled = target.items.every(item => item.matched)
      })
      return { id: existing.id, duplicated: true }
    }
    const id = `office-${Date.now()}`
    this.commit(state => {
      const officeAction: OfficeAction = {
        id, name: data.name, documentNumber: data.documentNumber, issuedAt: data.issuedAt,
        createdAt: new Date().toISOString(), reconciled: false, reconciledAt: null, finalized: false, finalizedAt: null,
        items: data.items.map((item, index) => ({
          id: `defect-${Date.now()}-${index + 1}`, officeActionId: id, sequence: index + 1,
          claimId: null, featureId: null, text: item.text,
          conclusion: item.conclusion || 'pending', conclusionInvalid: false,
          matched: false, response: null
        }))
      }
      state.officeActions.push(officeAction)
    })
    return { id, duplicated: false }
  }

  reconcileOfficeAction(id: string): ReconcileResult {
    const result: ReconcileResult = { matched: 0, unmatched: 0, total: 0, items: [] }
    this.commit(state => {
      const officeAction = state.officeActions.find(item => item.id === id)
      if (!officeAction) return
      result.total = officeAction.items.length
      for (const item of officeAction.items) {
        if (item.matched) {
          result.matched++
          result.items.push({ itemId: item.id, matched: true, claimId: item.claimId, featureId: item.featureId, reason: '已对上' })
          continue
        }
        const match = this.autoMatchItem(item.text, state)
        if (match) {
          item.claimId = match.claimId
          item.featureId = match.featureId
          item.matched = true
          result.matched++
          result.items.push({ itemId: item.id, matched: true, claimId: match.claimId, featureId: match.featureId, reason: match.reason })
        } else {
          result.unmatched++
          result.items.push({ itemId: item.id, matched: false, claimId: null, featureId: null, reason: '未能自动匹配，待人工认领' })
        }
      }
      officeAction.reconciled = officeAction.items.every(item => item.matched)
      if (officeAction.reconciled) officeAction.reconciledAt = new Date().toISOString()
    })
    return result
  }

  private autoMatchItem(text: string, state: WorkbenchState): { claimId: string; featureId: string; reason: string } | null {
    // 提取权利要求编号
    const claimMatch = text.match(/权利要求\s*(\d+)/)
    if (!claimMatch) return null
    const claimNumber = Number(claimMatch[1])
    const claim = state.claims.find(item => item.number === claimNumber)
    if (!claim) return null
    // 提取特征标签
    let feature: Feature | undefined
    const letterMatch = text.match(/特征\s*([A-Z])/)
    if (letterMatch) {
      const letter = letterMatch[1]
      feature = state.features.find(item => item.claimId === claim.id && item.label.includes(`· ${letter} `))
    }
    if (!feature) {
      // 尝试按特征标签文字匹配
      feature = state.features.find(item => item.claimId === claim.id && text.includes(item.label.split('·')[1]?.trim() || item.label))
    }
    if (!feature) return null
    return { claimId: claim.id, featureId: feature.id, reason: `自动匹配权利要求${claimNumber} · ${feature.label}` }
  }

  matchDefectItem(itemId: string, claimId: string, featureId: string): void {
    this.commit(state => {
      const item = this.findDefectItem(state, itemId)
      if (!item) return
      item.claimId = claimId
      item.featureId = featureId
      item.matched = true
      const officeAction = state.officeActions.find(oa => oa.id === item.officeActionId)
      if (officeAction) {
        officeAction.reconciled = officeAction.items.every(i => i.matched)
        if (officeAction.reconciled) officeAction.reconciledAt = new Date().toISOString()
      }
    })
  }

  unmatchDefectItem(itemId: string): void {
    this.commit(state => {
      const item = this.findDefectItem(state, itemId)
      if (!item) return
      item.claimId = null
      item.featureId = null
      item.matched = false
      const officeAction = state.officeActions.find(oa => oa.id === item.officeActionId)
      if (officeAction) officeAction.reconciled = false
    })
  }

  createResponse(itemId: string, type: 'amendment' | 'argument', text: string, basis: string, amendedFeatureId: string | null): void {
    this.commit(state => {
      const item = this.findDefectItem(state, itemId)
      if (!item) return
      let amendedFromText: string | null = null
      if (type === 'amendment' && amendedFeatureId) {
        const feature = state.features.find(f => f.id === amendedFeatureId)
        if (feature) amendedFromText = feature.text
      }
      const response: DefectResponse = {
        id: `response-${Date.now()}`, defectItemId: itemId, type, text, basis,
        amendedFeatureId: type === 'amendment' ? amendedFeatureId : null,
        amendedFromText, status: 'incomplete', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      }
      response.status = this.computeDefectResponseStatus(response, state)
      item.response = response
    })
  }

  updateResponse(itemId: string, patch: Partial<Pick<DefectResponse, 'type' | 'text' | 'basis' | 'amendedFeatureId'>>): void {
    this.commit(state => {
      const item = this.findDefectItem(state, itemId)
      if (!item || !item.response) return
      const response = item.response
      if (patch.type !== undefined) response.type = patch.type
      if (patch.text !== undefined) response.text = patch.text
      if (patch.basis !== undefined) response.basis = patch.basis
      if (patch.amendedFeatureId !== undefined) {
        response.amendedFeatureId = patch.amendedFeatureId
        if (patch.type === 'amendment' || response.type === 'amendment') {
          const feature = state.features.find(f => f.id === patch.amendedFeatureId)
          response.amendedFromText = feature ? feature.text : null
        }
      }
      response.updatedAt = new Date().toISOString()
      response.status = this.computeDefectResponseStatus(response, state)
    })
  }

  deleteResponse(itemId: string): void {
    this.commit(state => {
      const item = this.findDefectItem(state, itemId)
      if (!item) return
      item.response = null
    })
  }

  private computeDefectResponseStatus(response: DefectResponse, state: WorkbenchState): 'complete' | 'incomplete' {
    if (response.type === 'argument') {
      return response.basis.trim() ? 'complete' : 'incomplete'
    }
    // amendment: 必须指向确实动过的特征
    if (!response.amendedFeatureId) return 'incomplete'
    const feature = state.features.find(f => f.id === response.amendedFeatureId)
    if (!feature) return 'incomplete' // 特征被撤掉
    if (response.amendedFromText !== null && feature.text === response.amendedFromText) return 'incomplete' // 特征被改回
    return 'complete'
  }

  private refreshDefectResponseStatusForFeature(state: WorkbenchState, featureId: string): void {
    for (const officeAction of state.officeActions) {
      for (const item of officeAction.items) {
        if (item.featureId === featureId) {
          item.conclusionInvalid = true
          if (item.response) item.response.status = this.computeDefectResponseStatus(item.response, state)
        }
      }
    }
  }

  private findDefectItem(state: WorkbenchState, itemId: string): DefectItem | undefined {
    for (const officeAction of state.officeActions) {
      const item = officeAction.items.find(i => i.id === itemId)
      if (item) return item
    }
    return undefined
  }

  finalizeOfficeAction(id: string): { ok: boolean; reason: string } {
    const state = this.stateSubject.value
    const officeAction = state.officeActions.find(item => item.id === id)
    if (!officeAction) return { ok: false, reason: '未找到审查意见' }
    if (!officeAction.reconciled) return { ok: false, reason: '尚有缺陷条目未对上，请先完成对账' }
    const incomplete = officeAction.items.filter(item => !item.response || item.response.status !== 'complete')
    if (incomplete.length) return { ok: false, reason: `尚有 ${incomplete.length} 条答复未完成` }
    this.commit(state => {
      const target = state.officeActions.find(item => item.id === id)
      if (target) {
        target.finalized = true
        target.finalizedAt = new Date().toISOString()
      }
    })
    return { ok: true, reason: '已定稿' }
  }

  exportComparisonTable(id: string): string {
    const state = this.stateSubject.value
    const officeAction = state.officeActions.find(item => item.id === id)
    if (!officeAction) return ''
    const rows = officeAction.items.map(item => {
      const claim = state.claims.find(c => c.id === item.claimId)
      const feature = state.features.find(f => f.id === item.featureId)
      const response = item.response
      return [
        item.sequence,
        claim ? `权利要求${claim.number}` : '未匹配',
        feature ? feature.label : '未匹配',
        item.text,
        item.conclusion === 'upheld' ? '缺陷成立' : item.conclusion === 'rejected' ? '缺陷不成立' : '待定',
        item.conclusionInvalid ? '已失效' : '有效',
        response ? (response.type === 'amendment' ? '修改' : '讲理由') : '未答复',
        response?.text || '',
        response?.basis || '',
        response?.status === 'complete' ? '已完成' : '未完成'
      ]
    })
    const csv = [['序号', '权利要求', '技术特征', '审查意见', '审查员结论', '结论状态', '答复方式', '答复内容', '依据', '答复状态'], ...rows]
      .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    return `﻿${csv}`
  }

  validate(state = this.stateSubject.value): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    for (const feature of state.features) {
      if (!feature.text.trim()) issues.push({ id: `empty-${feature.id}`, severity: 'warning', type: 'empty-feature', featureId: feature.id, title: `${feature.label} 内容为空`, detail: '请补全技术特征文字，避免映射对象不明确。' })
      if (!feature.supportIds.length) issues.push({ id: `support-${feature.id}`, severity: 'error', type: 'missing-support', featureId: feature.id, title: `${feature.label} 缺少说明书依据`, detail: '至少为一个说明书段落建立支持映射。' })
      if (this.hasReferenceCycle(feature, state.features)) issues.push({ id: `cycle-${feature.id}`, severity: 'error', type: 'cycle', featureId: feature.id, title: `${feature.label} 存在循环引用`, detail: '特征层级或引用关系形成闭环，请移除其中一条关系。' })
    }
    state.orphanMappings.forEach(item => issues.push({ id: item.id, severity: 'warning', type: 'orphan-mapping', title: '存在待清理映射', detail: item.reason }))
    // 审查意见相关问题
    for (const officeAction of state.officeActions) {
      if (!officeAction.reconciled) {
        const unmatched = officeAction.items.filter(item => !item.matched).length
        issues.push({ id: `office-reconcile-${officeAction.id}`, severity: 'warning', type: 'office-action', title: `${officeAction.name} 未完成对账`, detail: `尚有 ${unmatched} 条缺陷条目未对上，请先完成对账。` })
      }
      if (officeAction.reconciled && !officeAction.finalized) {
        const incomplete = officeAction.items.filter(item => !item.response || item.response.status !== 'complete').length
        if (incomplete) issues.push({ id: `office-response-${officeAction.id}`, severity: 'warning', type: 'office-action', title: `${officeAction.name} 答复未完成`, detail: `尚有 ${incomplete} 条答复未完成，完成后可定稿导出对照表。` })
      }
    }
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

  private commit(recipe: (state: WorkbenchState) => void): void {
    const current = clone(this.stateSubject.value)
    const next = clone(current)
    recipe(next)
    this.past.push(current)
    if (this.past.length > 60) this.past.shift()
    this.future = []
    this.stateSubject.next(next)
    this.updateHistory()
    this.saveState()
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
