import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { TextareaModule } from 'primeng/textarea'
import { SelectModule } from 'primeng/select'
import { CardModule } from 'primeng/card'
import { BadgeModule } from 'primeng/badge'
import { DialogModule } from 'primeng/dialog'
import { TooltipModule } from 'primeng/tooltip'
import { Subscription } from 'rxjs'
import type { Annotation, Claim, DefectType, Feature, OfficeAction, OfficeActionItem, ReplyMode, Role, ValidationIssue, WorkbenchState } from './models'
import { WorkbenchService } from './workbench.service'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TextareaModule, SelectModule, CardModule, BadgeModule, DialogModule, TooltipModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  state: WorkbenchState
  issues: ValidationIssue[] = []
  history = { past: 0, future: 0 }
  compareA = ''
  compareB = ''
  annotationDraft = ''
  versionDialog = false
  versionName = ''
  activeIssue: ValidationIssue | null = null
  ingestDialog = false
  ingestRaw = ''
  ingestMessage = ''
  selectedActionId = ''
  replyDrafts = new Map<string, { mode: ReplyMode; text: string }>()
  claimDrafts = new Map<string, string>()
  basisDrafts = new Map<string, string[]>()
  conclusionDrafts = new Map<string, string>()
  finalizeMessage = ''
  readonly defectTypeLabels: Array<{ label: string; value: DefectType }> = [
    { label: '新颖性', value: 'novelty' },
    { label: '创造性', value: 'inventive-step' },
    { label: '清楚性（A26.4）', value: 'clarity' },
    { label: '支持/公开充分', value: 'support' },
    { label: '形式缺陷', value: 'formal' },
    { label: '其他', value: 'other' }
  ]
  roleOptions: Array<{ label: string; value: Role }> = [
    { label: '代理人（可编辑主数据与本人批注）', value: 'author' },
    { label: '审查员（可编辑本人批注）', value: 'examiner' },
    { label: '观察者（只读）', value: 'viewer' }
  ]
  private subscriptions = new Subscription()

  constructor(readonly service: WorkbenchService) {
    this.state = service.snapshot
  }

  ngOnInit(): void {
    this.subscriptions.add(this.service.state$.subscribe(state => {
      this.state = structuredClone(state)
      this.syncVersions()
      this.syncOfficeAction()
    }))
    this.subscriptions.add(this.service.issues$.subscribe(issues => this.issues = issues))
    this.subscriptions.add(this.service.history$.subscribe(history => this.history = history))
    window.addEventListener('keydown', this.handleKeyboard)
  }

  ngAfterViewInit(): void {
    const position = this.service.readPosition()
    setTimeout(() => window.scrollTo({ top: position.scrollY || 0, behavior: 'instant' as ScrollBehavior }), 0)
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
    window.removeEventListener('keydown', this.handleKeyboard)
  }

  get selectedClaim(): Claim | undefined { return this.state.claims.find(item => item.id === this.state.selectedClaimId) }
  get selectedFeature(): Feature | undefined { return this.state.features.find(item => item.id === this.state.selectedFeatureId) }
  get claimFeatures(): Feature[] { return this.state.features.filter(item => item.claimId === this.state.selectedClaimId) }
  get featureAnnotations(): Annotation[] { return this.selectedFeature ? this.state.annotations.filter(item => item.featureId === this.selectedFeature?.id) : [] }
  get currentRoleLabel(): string { return this.roleOptions.find(item => item.value === this.state.role)?.label || '' }
  get errorCount(): number { return this.issues.filter(item => item.severity === 'error').length }
  get warningCount(): number { return this.issues.filter(item => item.severity === 'warning').length }
  get canEditMainData(): boolean { return this.state.role !== 'viewer' }
  get mappedFeatureCount(): number { return this.claimFeatures.filter(feature => feature.supportIds.length > 0).length }

  claimLabel(id: string): string { return this.state.claims.find(item => item.id === id)?.title || '未命名权利要求' }
  featureLabel(id: string): string { return this.state.features.find(item => item.id === id)?.label || id }
  paragraphLabel(id: string): string { return this.state.paragraphs.find(item => item.id === id)?.section || id }
  isMapped(feature: Feature, paragraphId: string): boolean { return feature.supportIds.includes(paragraphId) }
  isOwnAnnotation(annotation: Annotation): boolean { return annotation.authorRole === this.state.role }
  ownerLabel(role: Role): string { return ({ author: '代理人', examiner: '审查员', viewer: '观察者' })[role] }

  updateClaimField(field: 'title' | 'text' | 'number' | 'independent', event: Event): void {
    const element = event.target as HTMLInputElement
    const value = field === 'number' ? Number(element.value) : field === 'independent' ? element.checked : element.value
    this.service.updateClaim({ [field]: value })
  }

  updateFeatureField(field: 'label' | 'text', event: Event): void {
    if (!this.selectedFeature) return
    this.service.updateFeature(this.selectedFeature.id, { [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value })
  }

  updateFeatureParent(event: Event): void {
    if (!this.selectedFeature) return
    this.service.updateFeature(this.selectedFeature.id, { parentId: (event.target as HTMLSelectElement).value || null })
  }

  toggleReference(featureId: string, checked: boolean): void {
    if (!this.selectedFeature) return
    const ids = checked
      ? Array.from(new Set([...this.selectedFeature.referenceIds, featureId]))
      : this.selectedFeature.referenceIds.filter(id => id !== featureId)
    this.service.updateFeature(this.selectedFeature.id, { referenceIds: ids })
  }

  addAnnotation(): void {
    if (!this.selectedFeature) return
    this.service.addAnnotation(this.selectedFeature.id, this.annotationDraft)
    this.annotationDraft = ''
  }

  updateAnnotation(annotation: Annotation, event: Event): void {
    this.service.updateAnnotation(annotation.id, (event.target as HTMLTextAreaElement).value)
  }

  createVersion(): void {
    this.service.createVersion(this.versionName)
    this.versionName = ''
    this.versionDialog = false
  }

  restoreVersion(id: string): void {
    this.service.restoreVersion(id)
  }

  getVersion(id: string) { return this.state.versions.find(item => item.id === id) }

  // ── 审查意见答复 ──────────────────────────────────────────────────────
  get officeActions(): OfficeAction[] { return this.state.officeActions }
  get selectedAction(): OfficeAction | undefined { return this.officeActions.find(action => action.id === this.selectedActionId) || this.officeActions[0] }
  get unclaimedItems(): OfficeActionItem[] { return this.selectedAction?.items.filter(item => !item.workbench.claimId) || [] }
  staleCount(action: OfficeAction): number { return action.items.filter(item => item.workbench.conclusionStale).length }
  get incompleteItems(): OfficeActionItem[] {
    const action = this.selectedAction
    return action ? action.items.filter(item => this.statusOf(item).status !== 'complete') : []
  }
  get canFinalize(): boolean { return !!this.selectedAction && this.selectedAction.items.length > 0 && this.incompleteItems.length === 0 }

  defectLabel(type: DefectType): string { return this.defectTypeLabels.find(option => option.value === type)?.label || type }

  statusOf(item: OfficeActionItem): { status: 'complete' | 'incomplete' | 'unclaimed'; reason: string } {
    return this.service.itemStatus(item, this.state.features)
  }

  itemFeature(item: OfficeActionItem): Feature | undefined {
    return this.state.features.find(feature => feature.id === item.workbench.featureId)
  }

  itemClaim(item: OfficeActionItem): Claim | undefined {
    return this.state.claims.find(claim => claim.id === item.workbench.claimId)
  }

  featureChangedSinceBaseline(item: OfficeActionItem): boolean {
    const feature = this.itemFeature(item)
    return !!feature && item.workbench.baselineFeatureText !== null && feature.text !== item.workbench.baselineFeatureText
  }

  replyModeDraft(item: OfficeActionItem): ReplyMode { return this.replyDrafts.get(item.id)?.mode || item.workbench.replyMode || 'amend' }
  replyTextDraft(item: OfficeActionItem): string { return this.replyDrafts.get(item.id)?.text ?? item.workbench.replyText }

  setReplyMode(item: OfficeActionItem, mode: ReplyMode): void {
    this.replyDrafts.set(item.id, { mode, text: this.replyTextDraft(item) })
  }

  setReplyText(item: OfficeActionItem, text: string): void {
    this.replyDrafts.set(item.id, { mode: this.replyModeDraft(item), text })
  }

  conclusionDraft(item: OfficeActionItem): string { return this.conclusionDrafts.get(item.id) ?? item.examiner.conclusion }
  setConclusionDraft(item: OfficeActionItem, text: string): void { this.conclusionDrafts.set(item.id, text) }

  basisChecked(item: OfficeActionItem, paragraphId: string): boolean {
    return (this.basisDrafts.get(item.id) ?? item.workbench.basisSupportIds).includes(paragraphId)
  }

  toggleBasis(item: OfficeActionItem, paragraphId: string, checked: boolean): void {
    const current = this.basisDrafts.get(item.id) ?? [...item.workbench.basisSupportIds]
    const next = checked ? Array.from(new Set([...current, paragraphId])) : current.filter(id => id !== paragraphId)
    this.basisDrafts.set(item.id, next)
  }

  claimDraft(item: OfficeActionItem): string {
    const existing = this.claimDrafts.get(item.id)
    if (existing !== undefined) return existing
    const claim = this.itemClaim(item)
    const feature = this.itemFeature(item)
    return claim && feature ? `${claim.id}::${feature.id}` : ''
  }

  setClaimDraft(item: OfficeActionItem, value: string): void { this.claimDrafts.set(item.id, value) }

  claimFeatureOptions(claimId: string): Feature[] { return this.state.features.filter(feature => feature.claimId === claimId) }

  saveReply(action: OfficeAction, item: OfficeActionItem): void {
    const draft = this.replyDrafts.get(item.id)
    const mode = draft?.mode || item.workbench.replyMode || 'amend'
    const text = draft?.text ?? item.workbench.replyText
    const basis = this.basisDrafts.get(item.id) ?? item.workbench.basisSupportIds
    const ok = this.service.saveReply(action.id, item.id, { mode, text, basisSupportIds: basis })
    if (!ok) this.finalizeMessage = '“已改”必须指到本次确实动过的特征：请先在「特征映射」中修改该特征，再保存答复。'
  }

  saveConclusion(action: OfficeAction, item: OfficeActionItem): void {
    this.service.saveExaminerConclusion(action.id, item.id, this.conclusionDraft(item))
  }

  claimItem(action: OfficeAction, item: OfficeActionItem): void {
    const value = this.claimDraft(item)
    const separator = value.indexOf('::')
    if (separator < 0) return
    this.service.claimItem(action.id, item.id, value.slice(0, separator), value.slice(separator + 2))
  }

  releaseItem(action: OfficeAction, item: OfficeActionItem): void {
    this.service.releaseItem(action.id, item.id)
  }

  rematch(action: OfficeAction): void {
    const count = this.service.rematchUnclaimed(action.id)
    this.finalizeMessage = count ? `重试对账：新补上 ${count} 条，其余仍列待认领。` : '本次没有新对上的条目，待认领条目保留。'
  }

  openIngestDialog(): void {
    this.ingestMessage = ''
    this.ingestRaw = `远程文号：OA-CN-2026-0917-1
意见名称：第一次审查意见通知书
---
编号：1
类型：clarity
权项号：1
特征标签：B · 环境传感模块
意见正文：权利要求1中“温湿度数据”的含义不清楚……
审查结论：认定不清楚，需修改或说明。
`
    this.ingestDialog = true
  }

  submitIngest(): void {
    try {
      const parsed = this.parseIngest(this.ingestRaw)
      if (!parsed.remoteId) throw new Error('缺少“远程文号”')
      if (!parsed.items.length) throw new Error('缺少缺陷条目（用 --- 分隔，每条至少填 编号/类型/意见正文）')
      const result = this.service.ingestOfficeAction({ remoteId: parsed.remoteId, title: parsed.title, items: parsed.items })
      if (!result.actionId) { this.ingestMessage = '送达失败：只有审查员角色可以送达审查意见。'; return }
      this.selectedActionId = result.actionId
      this.ingestMessage = result.created
        ? `已新建意见：自动对上 ${result.matched} 条，${result.unclaimed} 条进入待认领。`
        : '同一份意见已存在：未重复建条目，仅按审查意见更新条目原文；代理人答复与依据保留。'
      if (result.created) this.ingestDialog = false
    } catch (error) {
      this.ingestMessage = `送达失败：${(error as Error).message}。本地记录未改动。`
    }
  }

  private parseIngest(raw: string): { remoteId: string; title: string; items: Array<{ remoteKey: string; defectNo: string; defectType: DefectType; opinionText: string; conclusion: string; suggestedClaimNumber: number | null; suggestedFeatureLabel: string | null }> } {
    const blocks = raw.split(/^---\s*$/m).map(block => block.trim()).filter(Boolean)
    const header = this.blockToMap(blocks.shift() || '')
    const validTypes: DefectType[] = ['novelty', 'inventive-step', 'clarity', 'support', 'formal', 'other']
    const items = blocks.map((block, index) => {
      const map = this.blockToMap(block)
      const type = (map.get('类型') || 'other') as DefectType
      if (!validTypes.includes(type)) throw new Error(`第 ${index + 1} 条类型“${type}”不在 ${validTypes.join(' / ')} 中`)
      const claimValue = map.get('权项号')?.trim()
      return {
        remoteKey: map.get('远程条目键')?.trim() || map.get('编号')?.trim() || `${Date.now()}-${index}`,
        defectNo: map.get('编号')?.trim() || String(index + 1),
        defectType: type,
        opinionText: map.get('意见正文')?.trim() || '',
        conclusion: map.get('审查结论')?.trim() || '',
        suggestedClaimNumber: claimValue ? Number(claimValue) : null,
        suggestedFeatureLabel: map.get('特征标签')?.trim() || null
      }
    })
    return { remoteId: header.get('远程文号')?.trim() || '', title: header.get('意见名称')?.trim() || '审查意见', items }
  }

  private blockToMap(block: string): Map<string, string> {
    const map = new Map<string, string>()
    for (const line of block.split(/\r?\n/)) {
      const index = line.indexOf('：')
      if (index > 0) map.set(line.slice(0, index).trim(), line.slice(index + 1).trim())
    }
    return map
  }

  finalize(action: OfficeAction): void {
    this.finalizeMessage = ''
    const result = this.service.finalizeOfficeAction(action.id)
    this.finalizeMessage = result.reason
  }

  /** 只有定稿成功才真正触发下载；对账失败仅提示，本地记录都留着 */
  finalizeAndExport(action: OfficeAction): void {
    const result = this.service.finalizeOfficeAction(action.id)
    this.finalizeMessage = result.reason
    if (result.ok) this.exportReconciliation(action)
  }

  exportReconciliation(action: OfficeAction): void {
    const csv = action.export?.csv || this.service.reconciliationCsv(action)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `office-action-reconciliation-${action.remoteId}-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  locateItem(item: OfficeActionItem): void {
    if (item.workbench.claimId) this.service.selectClaim(item.workbench.claimId)
    if (item.workbench.featureId) this.service.selectFeature(item.workbench.featureId)
    this.service.setTab('mapping')
  }

  compareRows(): Array<{ label: string; before: string; after: string; changed: boolean }> {
    const a = this.getVersion(this.compareA)
    const b = this.getVersion(this.compareB)
    if (!a || !b) return []
    const ids = Array.from(new Set([...a.claims.map(item => item.id), ...b.claims.map(item => item.id)]))
    return ids.map(id => {
      const before = a.claims.find(item => item.id === id)?.text || ''
      const after = b.claims.find(item => item.id === id)?.text || ''
      return { label: `权利要求 ${a.claims.find(item => item.id === id)?.number || b.claims.find(item => item.id === id)?.number || '?'}`, before, after, changed: before !== after }
    })
  }

  exportFile(type: 'json' | 'csv'): void {
    const content = type === 'json' ? this.service.exportJson() : this.service.exportCsv()
    const mime = type === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8'
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `patent-claim-check-${new Date().toISOString().slice(0, 10)}.${type}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  locateIssue(issue: ValidationIssue): void {
    this.activeIssue = issue
    if (issue.featureId) this.service.selectFeature(issue.featureId)
    this.service.setTab('mapping')
  }

  closeIssue(): void { this.activeIssue = null }

  private syncVersions(): void {
    if (!this.state.versions.some(item => item.id === this.compareA)) this.compareA = this.state.versions[1]?.id || this.state.versions[0]?.id || ''
    if (!this.state.versions.some(item => item.id === this.compareB)) this.compareB = this.state.versions[0]?.id || ''
  }

  private syncOfficeAction(): void {
    if (!this.state.officeActions.some(action => action.id === this.selectedActionId)) {
      this.selectedActionId = this.state.officeActions[0]?.id || ''
    }
  }

  private handleKeyboard = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey)) return
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.shiftKey ? this.service.redo() : this.service.undo()
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault()
      this.service.redo()
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault()
      this.versionDialog = true
    }
  }
}
