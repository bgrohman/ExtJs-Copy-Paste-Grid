(function(globals) {
	"use strict";

	var Ext = globals.Ext,
		_ = globals._,
		$ = globals.$;

	Ext.define('bg.Ext.CopyPasteGrid', {
		extend: 'Ext.grid.Panel',
		requires: [
			'bg.Ext.MultiCellSelectionModel',
			'Ext.util.KeyMap'
		],
		selModel: Ext.create('bg.Ext.MultiCellSelectionModel', {
			mode: 'MULTI',
			allowDeselect: true
		}),
		rowDelimiter: '\n',
		columnDelimiter: '\t',
		autoCommit: false,
		listeners: {
			afterrender: function(grid) {
				var $el = $(grid.getEl().dom);
				$el.focus();

				$el.on('keydown', function(e) {
					if (e.keyCode === 67 && e.ctrlKey) {
						grid.copyToClipboard();
					} else if (e.keyCode === 86 && e.ctrlKey) {
						grid.pasteFromClipboard();
					}
				});
			}
		},
		getFrozenColumnsCount: function() {
			var self = this,
				selectionModel = self.getSelectionModel();

			if (selectionModel.views.length > 1) {
				return selectionModel.views[0].getGridColumns().length;
			}

			return 0;
		},
		getCopyPasteTextarea: function() {
			var $ta = $('<textarea></textarea>');

			$ta.css('position', 'absolute');
			$ta.css('left', '-1000px');
			$ta.css('top', '0');
			$('body').append($ta);
			$ta.focus();

			return $ta;
		},
		toClipboard: function(text) {
			var self = this,
				$ta = self.getCopyPasteTextarea();

			$ta.val(text);
			$ta.focus().select();

			_.delay(function() {
				$ta.remove();
				$(self.getEl().dom).focus();
			}, 200);
		},
		pasteFromClipboard: function() {
			var self = this,
				$ta = self.getCopyPasteTextarea();

			$ta.focus().select();

			_.delay(function() {
				self.pasteToSelection($ta.val());
				$(self.getEl().dom).focus();
			}, 200);
		},
		copyToClipboard: function() {
			var self = this,
				selectionModel = self.getSelectionModel(),
				selected = selectionModel.selected,
				frozenColumnsCount,
				selectionStart,
				rawData = [],
				rawText;

			if (_.isEmpty(selected.items)) {
				self.toClipboard('');
				return;
			}

			frozenColumnsCount = self.getFrozenColumnsCount();
			selectionStart = selected.items[0].position;

			_.each(selected.items, function(item, i) {
				var row = item.position.row,
					column = item.position.column,
					columnName = self.columns[column + frozenColumnsCount].dataIndex,
					value = self.store.getAt(row).get(columnName),
					adjustedRow = row - selectionStart.row,
					adjustedCol = column - selectionStart.column;

				rawData[adjustedRow] = rawData[adjustedRow] || [];
				rawData[adjustedRow][adjustedCol] = value;
			});

			rawText = _.reduce(rawData, function(memo, rawColumn) {
				var rowText = rawColumn.join(self.columnDelimiter);

				if (!_.isEmpty(memo)) {
					return memo + self.rowDelimiter + rowText;
				}
				return memo + rowText;
			}, '');

			self.toClipboard(rawText);
		},
		pasteToSelection: function(text) {
			var self = this,
				selectionModel,
				selected,
				selectionStart,
				selectionEnd,
				selectionRowCount,
				selectionColumnCount,
				parsed,
				rowCount,
				colCount;

			if (_.isUndefined(text) || _.isNull(text) || _.isEmpty(text)) {
				return;
			}

			parsed = self.parseText(text);

			if (_.isEmpty(parsed) || _.isEmpty(parsed[0])) {
				return;
			}

			rowCount = parsed.length;
			colCount = parsed[0].length;

			selectionModel = self.getSelectionModel();
			selected = selectionModel.selected;
			selectionStart = selected.items[0].position;
			selectionEnd = selected.items[selected.items.length - 1].position;
			selectionRowCount = selectionEnd.row - selectionStart.row + 1;
			selectionColumnCount = selectionEnd.column - selectionStart.column + 1;

			if (rowCount === selectionRowCount && colCount === selectionColumnCount) {
				self.pasteBlock(parsed);
			} else if (rowCount === 1 && colCount === 1) {
				self.pasteOneCellToBlock(parsed);
			} else if (rowCount === selectionRowCount && colCount === 1) {
				self.pasteOneColumnToMany(parsed);
			} else if (colCount === selectionColumnCount && rowCount === 1) {
				self.pasteOneRowToMany(parsed);
			}
		},
		pasteBlock: function(parsed) {
			var self = this,
				selected = self.getSelectionModel().selected,
				selectionStart = selected.items[0].position,
				rowOffset = selectionStart.row,
				frozenColumnsCount = self.getFrozenColumnsCount(),
				colOffset = selectionStart.column + frozenColumnsCount;

			_.each(parsed, function(row, r) {
				var pasteRow = r + rowOffset,
					record = self.store.getAt(pasteRow);

				_.each(row, function(col, c) {
					var pasteCol = c + colOffset,
						columnName = self.columns[pasteCol].dataIndex;
					record.set(columnName, col);
				});
			});
		},
		pasteOneCellToBlock: function(parsed) {
			var self = this,
				selected = self.getSelectionModel().selected,
				frozenColumnsCount = self.getFrozenColumnsCount(),
				value = parsed[0][0];

			_.each(selected.items, function(item) {
				var column = item.position.column + frozenColumnsCount,
					columnName = self.columns[column].dataIndex;

				self.store.getAt(item.position.row).set(columnName, value);
			});
		},
		pasteOneRowToMany: function(parsed) {
			var self = this,
				selected = self.getSelectionModel().selected,
				frozenColumnsCount = self.getFrozenColumnsCount(),
				selectionStart = selected.items[0].position,
				colStart = selectionStart.column + frozenColumnsCount;

			_.each(selected.items, function(item) {
				var column = item.position.column + frozenColumnsCount,
					columnName = self.columns[column].dataIndex,
					col = item.position.column - colStart,
					value = parsed[0][col];

				self.store.getAt(item.position.row).set(columnName, value);
			});
		},
		pasteOneColumnToMany: function(parsed) {
			var self = this,
				selected = self.getSelectionModel().selected,
				frozenColumnsCount = self.getFrozenColumnsCount(),
				selectionStart = selected.items[0].position,
				rowStart = selectionStart.row;

			_.each(selected.items, function(item) {
				var column = item.position.column + frozenColumnsCount,
					columnName = self.columns[column].dataIndex,
					row = item.position.row - rowStart,
					value = parsed[row][0];

				self.store.getAt(item.position.row).set(columnName, value);
			});
		},
		parseText: function(text) {
			var self = this,
				rows = text.split(self.rowDelimiter),
				isColumnEmpty = function(col) {
					return _.isUndefined(col) || _.isNull(col) || _.isEmpty(col);
				};

			return _.reduce(rows, function(memo, row, r) {
				var cols = row.split(self.columnDelimiter);

				if (!_.every(cols, isColumnEmpty)) {
					memo[r] = cols;
				}

				return memo;
			}, []);
		}
	});

}(this));
