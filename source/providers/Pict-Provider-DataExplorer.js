const libPictProvider = require('pict-provider');

const libPictDataExplorerDataProvider = require('./Pict-DataExplorer-DataProvider.js');
const libPictViewDataExplorer = require('../views/PictView-DataExplorer.js');

/**
 * Derive the text columns a tier's filter box searches (server-side substring LK). ALL non-key Lite
 * columns are searchable so a user can filter by anything they see — a code, a status, a city — not just
 * the title (a numeric column's LK simply never matches, which is harmless). The title / name field leads
 * (it is also the default sort key). The view ORs the clauses in a paren group so the search ANDs cleanly
 * with relationship / base filters.
 * @param {Record<string, any>} pEntity
 * @return {Array<string>}
 */
function deriveSearchFields(pEntity)
{
	const tmpLite = Array.isArray(pEntity.Lite) ? pEntity.Lite : [];
	const tmpSearchable = tmpLite.filter((pColumn) => !(/^(ID|GUID)/.test(pColumn)));
	if (tmpSearchable.length < 1) { return []; }
	const tmpTitle = pEntity.Display && pEntity.Display.Title;
	let tmpPrimary;
	if (tmpTitle && (String(tmpTitle).indexOf('{~') < 0) && (tmpSearchable.indexOf(tmpTitle) >= 0)) { tmpPrimary = tmpTitle; }
	else if (tmpSearchable.indexOf('Name') >= 0) { tmpPrimary = 'Name'; }
	else if (tmpSearchable.indexOf('Title') >= 0) { tmpPrimary = 'Title'; }
	else { tmpPrimary = tmpSearchable[0]; }
	return [ tmpPrimary ].concat(tmpSearchable.filter((pColumn) => pColumn !== tmpPrimary));
}

/** @type {Record<string, any>} */
const _DEFAULT_CONFIGURATION =
{
	ProviderIdentifier: 'Pict-DataExplorer',

	AutoInitialize: true,
	AutoInitializeOrdinal: 0,
};

/**
 * The pict-dataexplorer provider — the primary API surface. Ensures the resolution DataProvider exists,
 * normalizes an explorer config graph, and creates/reconfigures explorer view instances.
 *
 * Preview cards are a SOFT dependency: when the host has registered pict-section-recordset's
 * `RecordSetCardManager`, explored records render a clickable ⓘ card; otherwise they degrade to plain
 * text. `registerCards()` is a convenience passthrough for hosts that want to declare card layouts here.
 */
class PictProviderDataExplorer extends libPictProvider
{
	constructor(pFable, pOptions, pServiceHash)
	{
		let tmpOptions = Object.assign({}, _DEFAULT_CONFIGURATION, pOptions);
		super(pFable, tmpOptions, pServiceHash);
	}

	/**
	 * Create (or reconfigure + reuse) an explorer view instance.
	 * @param {string} pExplorerHash - unique hash/id; renders into `#<pExplorerHash>` unless DestinationAddress given.
	 * @param {Record<string, any>} pConfig - the explorer config graph (Entities / Roots / URLPrefix / PageSize / MaxDepth).
	 * @return {any} the explorer view instance.
	 */
	createExplorer(pExplorerHash, pConfig)
	{
		if (!this.pict.providers['Pict-DataExplorer-DataProvider'])
		{
			this.pict.addProvider('Pict-DataExplorer-DataProvider', libPictDataExplorerDataProvider.default_configuration, libPictDataExplorerDataProvider);
		}

		const tmpConfig = this.normalizeConfig(pConfig);
		const tmpDestination = (pConfig && pConfig.DestinationAddress) || `#${pExplorerHash}`;
		const tmpViewConfig = Object.assign({}, libPictViewDataExplorer.default_configuration,
			{
				ViewIdentifier: pExplorerHash,
				ExplorerHash: pExplorerHash,
				ExplorerConfig: tmpConfig,
				DestinationAddress: tmpDestination,
				DefaultDestinationAddress: tmpDestination,
			});

		if (this.pict.views[pExplorerHash])
		{
			Object.assign(this.pict.views[pExplorerHash].options, tmpViewConfig);
			return this.pict.views[pExplorerHash];
		}
		return this.pict.addView(pExplorerHash, tmpViewConfig, libPictViewDataExplorer);
	}

	/**
	 * Fill in the defaults on an explorer config graph so the view + DataProvider can consume it directly.
	 * @param {Record<string, any>} pConfig
	 * @return {Record<string, any>} the normalized config (a copy; the input is not mutated).
	 */
	normalizeConfig(pConfig)
	{
		const tmpConfig = Object.assign({ URLPrefix: '', PageSize: 25, MaxDepth: 6 }, pConfig || {});
		const tmpEntities = {};
		const tmpSourceEntities = tmpConfig.Entities || {};
		for (const tmpName of Object.keys(tmpSourceEntities))
		{
			const tmpEntity = Object.assign({}, tmpSourceEntities[tmpName]);
			tmpEntity.Entity = tmpEntity.Entity || tmpName;
			tmpEntity.IDField = tmpEntity.IDField || `ID${tmpEntity.Entity}`;
			tmpEntity.GUIDField = tmpEntity.GUIDField || `GUID${tmpEntity.Entity}`;
			tmpEntity.Lite = Array.isArray(tmpEntity.Lite) ? tmpEntity.Lite : [];
			tmpEntity.URLPrefix = tmpEntity.URLPrefix || tmpConfig.URLPrefix || '';
			tmpEntity.Display = tmpEntity.Display || { Title: tmpEntity.IDField };
			tmpEntity.SearchFields = Array.isArray(tmpEntity.SearchFields) ? tmpEntity.SearchFields : deriveSearchFields(tmpEntity);
			tmpEntity.Children = (Array.isArray(tmpEntity.Children) ? tmpEntity.Children : []).map((pChild) =>
				Object.assign({}, pChild,
					{
						Label: pChild.Label || pChild.Entity,
						Resolve: pChild.Resolve || 'lazy',
						PageSize: pChild.PageSize || tmpConfig.PageSize,
					}));
			tmpEntities[tmpName] = tmpEntity;
		}
		tmpConfig.Entities = tmpEntities;
		tmpConfig.Roots = (Array.isArray(tmpConfig.Roots) ? tmpConfig.Roots : []).map((pRoot) =>
			Object.assign({}, pRoot, { Label: pRoot.Label || pRoot.Entity }));
		return tmpConfig;
	}

	/**
	 * Convenience passthrough: register preview-card layouts with the (soft-dependency) RecordSetCardManager.
	 * @param {Record<string, any>} pCardMap - `{ <EntityName>: <cardConfig>, ... }`.
	 * @return {boolean} true when a card manager was present to register into.
	 */
	registerCards(pCardMap)
	{
		const tmpManager = this.pict.providers.RecordSetCardManager;
		if (!tmpManager || (typeof tmpManager.registerCard !== 'function'))
		{
			this.log.warn('Pict-DataExplorer: registerCards() called but no RecordSetCardManager is registered — explored records will degrade to plain text.');
			return false;
		}
		const tmpMap = pCardMap || {};
		for (const tmpKey of Object.keys(tmpMap))
		{
			tmpManager.registerCard(tmpKey, tmpMap[tmpKey]);
		}
		return true;
	}
}

module.exports = PictProviderDataExplorer;
module.exports.default_configuration = _DEFAULT_CONFIGURATION;
