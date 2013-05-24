// From http://www.sencha.com/forum/showthread.php?214050-Multicell-selection-mode-on-grid
(function(globals) {
	var Ext = globals.Ext;

	Ext.define('bg.Ext.MultiCellSelectionModel', {
		extend: 'Ext.selection.Model',
		alias: 'selection.multicellmodel',
		requires: ['Ext.util.KeyNav'],
		enableKeyNav: true,
		preventWrap: false,
		selected: null,
		//lockableScope: 'normal',

		constructor: function() {
			this.addEvents('deselect', 'select');
			this.callParent(arguments);
		},

		bindComponent: function(view) {
			var self = this;
			self.primaryView = view;
			self.views = self.views || [];
			self.views.push(view);
			self.bind(view.getStore(), true);

			view.on({
				cellmousedown: self.onMouseDown,
				refresh: self.onViewRefresh,
				scope: self
			});

			if (self.enableKeyNav) {
				self.initKeyNav(view);
			}
		},

		initKeyNav: function(view) {
			var self = this;

			if (!view.rendered) {
				view.on('render', Ext.Function.bind(self.initKeyNav, self, [view], 0), self, {single: true});
				return;
			}

			view.el.set({
				tabIndex: -1
			});

			self.keyNav = Ext.create('Ext.util.KeyNav', view.el, {
				up: self.onKeyUp,
				down: self.onKeyDown,
				right: self.onKeyRight,
				left: self.onKeyLeft,
				tab: self.onKeyTab,
				scope: self
			});
		},

		getHeaderCt: function() {
			return this.primaryView.headerCt;
		},
		
		allCellDeselect: function() {
			var self = this,
				i,
				len = self.selected.items.length;

			for (i = 0; i < len; i += 1) {
				self.primaryView.onCellDeselect(self.selected.items[i].position);
			}
			
			self.fireEvent('deselect', self, this.selected);
			self.selected.items = [];
		},

		onKeyUp: function(e, t) {
			this.move('up', e);
		},

		onKeyDown: function(e, t) {
			this.move('down', e);
		},

		onKeyLeft: function(e, t) {
			this.move('left', e);
		},

		onKeyRight: function(e, t) {
			this.move('right', e);
		},

		move: function(dir, e) {
			var self = this,
				index,
				pos = self.primaryView.walkCells(self.getCurrentPosition(), dir, e, self.preventWrap),
				cell = self.primaryView.getCellByPosition(pos);

			if (pos) {
				self.setCurrentPosition(pos);
			}

			cell.position = pos;
			
			if (e.ctrlKey && self.isSelected(cell)) {
				if(self.allowDeselect){
					index = self.selected.items.indexOf(cell);
					self.selected.items.splice(index,1);
					self.primaryView.onCellDeselect(self.getCurrentPosition());
				}
			} else if (e.shiftKey && self.lastSelected) {
				if (self.getCurrentPosition()) {
					self.allCellDeselect();
				}
				self.selectRange(cell, false);
			} else if (e.ctrlKey) {
				self.doMultiSelect(cell, true, false);
			} else {
				if (self.getCurrentPosition()) {
					self.allCellDeselect();
				}
				self.doSingleSelect(cell);
			}
			
			return pos;
		},

		getCurrentPosition: function() {
			return this.position;
		},

		setCurrentPosition: function(pos) {
			var self = this;
			self.position = pos;
		},

		onMouseDown: function(view, cell, cellIndex, record, row, rowIndex, e) {
			var self = this;
			
			// Column is wrong when there are locked columns...
			self.setCurrentPosition({
				row: rowIndex,
				column: cellIndex
			});
			
			self.selectWithEvent(record, e);
		},
		
		isSelected: function(record) {
			record = Ext.isNumber(record) ? this.store.getAt(record) : record;

			if(this.selected.items == null || this.selected.items == ''){
				return false;
			}
			
			return this.selected.items.indexOf(record) !== -1;
		},
		
		selectWithEvent: function(record, e) {
			var self = this,
				cell,
				index;
			
			cell = self.primaryView.getCellByPosition(self.getCurrentPosition());
			cell.position = self.getCurrentPosition();
			
			switch (self.selectionMode) {
				case 'MULTI':
					if (e.ctrlKey && self.isSelected(cell)) {
						if(self.allowDeselect){
							index = self.selected.items.indexOf(cell);
							self.selected.items.splice(index,1);
							self.primaryView.onCellDeselect(self.getCurrentPosition());
						}
					} else if (e.shiftKey && self.lastSelected) {
						if (self.getCurrentPosition()) {
							self.allCellDeselect();
						}
						self.selectRange(cell, false);
					} else if (e.ctrlKey) {
						self.doMultiSelect(cell, true);
					} else {
						if (self.getCurrentPosition()) {
							self.allCellDeselect();
						}
						self.doSingleSelect(cell);
					}

					break;
				case 'SIMPLE':
					if (self.isSelected(record)) {
						self.doDeselect(record);
					} else {
						self.doSelect(record, true);
					}

					break;
				case 'SINGLE':
					if (self.allowDeselect && self.isSelected(record)) {
						self.doDeselect(record);
					} else {
						self.doSelect(record, false);
					}
					
					break;
			}
		},
		
		doSingleSelect: function(record, suppressEvent) {
			var self = this,
				changed = false,
				selected = self.selected;
			
			if (self.locked) {
				return;
			}

			if (self.isSelected(record)) {
				return;
			}

			function commit () {
				self.bulkChange = true;
				if (selected.getCount() > 0 && self.doDeselect(self.lastSelected, suppressEvent) === false) {
					delete self.bulkChange;
					return false;
				}
				delete self.bulkChange;

				self.selected.items.push(record);
				self.lastSelected = record;
				changed = true;

			}

			self.onSelectChange(record, true, suppressEvent, commit);
			self.primaryView.onCellSelect(record.position);
			
			if (changed) {
				if (!suppressEvent) {
					self.setLastFocused(record);
				}
				self.maybeFireSelectionChange(!suppressEvent);
			}
		},
		
		doMultiSelect: function(records, keepExisting, suppressEvent) {
			var self = this,
				selected = self.selected,
				change = false,
				i = 0,
				len, record;

			if (self.locked) {
				return;
			}

			records = !Ext.isArray(records) ? [records] : records;
			len = records.length;
			if (!keepExisting && selected.getCount() > 0) {
				if (self.doDeselect(self.getSelection(), suppressEvent) === false) {
					return;
				}
			}

			function commit () {
				selected.items.push(record);
				change = true;
			}

			for (; i < len; i++) {
				
				record = records[i];
				if (keepExisting && self.isSelected(record)) {
					continue;
				}
				
				self.onSelectChange(record, true, suppressEvent, commit);
				self.primaryView.onCellSelect(record.position);
			}
			self.setLastFocused(record, suppressEvent);
			self.maybeFireSelectionChange(change && !suppressEvent);
			
		},
		
		selectRange : function(record, keepExisting){
			var self = this,
				start, end,
				x,y,xmin,ymin,xmax,ymax,
				cell,
				records = [];
			
			if (self.isLocked()){
				return;
			}
			
			start = record.position;
			end = self.lastSelected.position

			if(start.column < end.column){
				xmin = start.column;
				xmax = end.column;
			}else{
				xmin = end.column;
				xmax = start.column;
			}
			
			if(start.row < end.row){
				ymin = start.row;
				ymax = end.row;
			}else{
				ymin = end.row;
				ymax = start.row;
			}
			
			for(x = xmin; x <= xmax; x++){
				for(y = ymin; y <= ymax; y++){
					cell = self.primaryView.getCellByPosition({row: y, column: x});
					cell.position = {row: y, column: x};
					self.doMultiSelect(cell, keepExisting, true);
				}
			}
			
			self.maybeFireSelectionChange(true);
		},
		
		onSelectChange: function(record, isSelected, suppressEvent, commitFn) {
			
			var self = this,
				view = self.view,
				eventName = isSelected ? 'select' : 'deselect';

			if ((suppressEvent || self.fireEvent('before' + eventName, self, record)) !== false &&
					commitFn() !== false) {

				if (isSelected) {
					view.onItemSelect(record);
				} else {
					view.onItemDeselect(record);
				}

				if (!suppressEvent) {
					self.fireEvent(eventName, self, record);
				}
			}
		},
		
		onKeyTab: function(e, t) {
			var self = this,
				direction = e.shiftKey ? 'left' : 'right',
				editingPlugin = self.view.editingPlugin,
				position = self.move(direction, e);

			if (editingPlugin && position && self.wasEditing) {
				editingPlugin.startEditByPosition(position);
			}
			delete self.wasEditing;
		},

		onEditorTab: function(editingPlugin, e) {
			var self = this,
				direction = e.shiftKey ? 'left' : 'right',
				position  = self.move(direction, e);

			if (position) {
				editingPlugin.startEditByPosition(position);
				self.wasEditing = true;
			}
		},

		refresh: Ext.emptyFn,

		onViewRefresh: Ext.emptyFn,

		selectByPosition: function(position) {
			this.setCurrentPosition(position);
		}
	});
}(this));
