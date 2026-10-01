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
import type { Annotation, Claim, DefectItem, Feature, OfficeAction, ReconcileResult, Role, ValidationIssue, WorkbenchState } from './models'
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
  roleOptions: Array<{ label: string; value: Role }> = [
    { label: '代理人（可编辑主数据与本人批注）', value: 'author' },
    { label: '审查员（可编辑本人批注）', value: 'examiner' },
    { label: '观察者（只读）', value: 'viewer' }
  ]
  // 审查意见相关
  officeActionDialog = false
  officeActionForm = { name: '', documentNumber: '', issuedAt: '', itemsText: '' }
  selectedOfficeActionId: string | null = null
  reconcileResult: ReconcileResult | null = null
  responseDrafts: Record<string, { type: 'amendment' | 'argument'; text: string; basis: string; amendedFeatureId: string | null }> = {}
  matchDialog = false
  matchTarget: DefectItem | null = null
  matchForm = { claimId: '', featureId: '' }
  private subscriptions = new Subscription()

  constructor(readonly service: WorkbenchService) {
    this.state = service.snapshot
  }

  ngOnInit(): void {
    this.subscriptions.add(this.service.state$.subscribe(state => {
      this.state = structuredClone(state)
      this.syncVersions()
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

  // ── 审查意见 ──────────────────────────────────────────────

  get officeActions(): OfficeAction[] { return this.state.officeActions }
  get selectedOfficeAction(): OfficeAction | undefined {
    return this.state.officeActions.find(item => item.id === this.selectedOfficeActionId)
  }
  get unmatchedItems(): DefectItem[] {
    return this.selectedOfficeAction?.items.filter(item => !item.matched) || []
  }

  openOfficeActionDialog(): void {
    this.officeActionForm = { name: '', documentNumber: '', issuedAt: '', itemsText: '' }
    this.officeActionDialog = true
  }

  submitOfficeAction(): void {
    const items = this.officeActionForm.itemsText.split('\n').map(line => line.trim()).filter(Boolean).map(text => ({ text }))
    if (!items.length) return
    const result = this.service.importOfficeAction({
      name: this.officeActionForm.name || `审查意见 ${new Date().toLocaleDateString('zh-CN')}`,
      documentNumber: this.officeActionForm.documentNumber || `OA-${Date.now()}`,
      issuedAt: this.officeActionForm.issuedAt || new Date().toISOString(),
      items
    })
    this.selectedOfficeActionId = result.id
    this.officeActionDialog = false
    this.reconcileResult = null
  }

  selectOfficeAction(id: string): void {
    this.selectedOfficeActionId = id
    this.reconcileResult = null
  }

  reconcile(): void {
    if (!this.selectedOfficeActionId) return
    this.reconcileResult = this.service.reconcileOfficeAction(this.selectedOfficeActionId)
  }

  openMatchDialog(item: DefectItem): void {
    this.matchTarget = item
    this.matchForm = { claimId: item.claimId || '', featureId: item.featureId || '' }
    this.matchDialog = true
  }

  submitMatch(): void {
    if (!this.matchTarget || !this.matchForm.claimId || !this.matchForm.featureId) return
    this.service.matchDefectItem(this.matchTarget.id, this.matchForm.claimId, this.matchForm.featureId)
    this.matchDialog = false
    this.matchTarget = null
  }

  unmatchItem(itemId: string): void {
    this.service.unmatchDefectItem(itemId)
  }

  getResponseDraft(item: DefectItem) {
    if (!this.responseDrafts[item.id]) {
      this.responseDrafts[item.id] = {
        type: item.response?.type || 'argument',
        text: item.response?.text || '',
        basis: item.response?.basis || '',
        amendedFeatureId: item.response?.amendedFeatureId || null
      }
    }
    return this.responseDrafts[item.id]
  }

  saveResponse(item: DefectItem): void {
    const draft = this.responseDrafts[item.id]
    if (!draft) return
    if (item.response) {
      this.service.updateResponse(item.id, { type: draft.type, text: draft.text, basis: draft.basis, amendedFeatureId: draft.amendedFeatureId })
    } else {
      this.service.createResponse(item.id, draft.type, draft.text, draft.basis, draft.amendedFeatureId)
    }
  }

  deleteResponse(itemId: string): void {
    this.service.deleteResponse(itemId)
    delete this.responseDrafts[itemId]
  }

  finalize(): void {
    if (!this.selectedOfficeActionId) return
    const result = this.service.finalizeOfficeAction(this.selectedOfficeActionId)
    if (!result.ok) alert(result.reason)
  }

  exportComparisonTable(): void {
    if (!this.selectedOfficeActionId) return
    const content = this.service.exportComparisonTable(this.selectedOfficeActionId)
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `审查意见对照表-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  claimFeaturesForMatch(claimId: string): Feature[] {
    return this.state.features.filter(item => item.claimId === claimId)
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
