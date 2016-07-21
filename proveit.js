/**
 * ProveIt is a powerful GUI tool for viewing, editing and creating references in Wikipedia
 *
 * Copyright 2008-2011 Georgia Tech Research Corporation, Atlanta, GA 30332-0415, ALL RIGHTS RESERVED
 * Copyright 2011- Matthew Flaschen
 * Rewritten and internationalized by Luis Felipe Schenone in 2014
 *
 * ProveIt is available under the GNU Free Documentation License (http://www.gnu.org/copyleft/fdl.html),
 * the Creative Commons Attribution/Share-Alike License 3.0 (http://creativecommons.org/licenses/by-sa/3.0/),
 * and the GNU General Public License 2 (http://www.gnu.org/licenses/gpl-2.0.html)
 */

( function ( mw, $ ) {

var proveit = {

	/**
	 * Interface messages
	 */
	messages: {
		'en': {
			'proveit-edit-tab': 'Edit',
			'proveit-add-tab': 'Add',
			'proveit-template-label': 'Template',
			'proveit-ref-name-label': 'Reference name',
			'proveit-insert-button': 'Insert',
			'proveit-update-button': 'Update',
			'proveit-show-all-params-button': 'Show all the parameters',
			'proveit-no-references': 'No references found',
		},
		'es': {
			'proveit-edit-tab': 'Editar',
			'proveit-add-tab': 'Agregar',
			'proveit-template-label': 'Plantilla',
			'proveit-ref-name-label': 'Nombre de la referencia',
			'proveit-insert-button': 'Insertar',
			'proveit-update-button': 'Actualizar',
			'proveit-show-all-params-button': 'Mostrar todos los parámetros',
			'proveit-no-references': 'No se han encontrado referencias',
		}
	},

	/**
	 * Per wiki settings
	 */
	settings: {
		'en': {
			'category': 'Category:Wikipedia:ProveIt',
			'tag': 'ProveIt',
		},
		'es': {
			'category': 'Categoría:Wikipedia:ProveIt',
			'tag': 'ProveIt',
		}
	},

	/**
	 * This will be filled with the template data retrieved from Wikipedia
	 */
	templates: {},

	/**
	 * URLs of the logo and icon hosted at Commons
	 */
	LOGO: '//upload.wikimedia.org/wikipedia/commons/0/0d/ProveIt_user_interface_logo.png',

	ICON: '//upload.wikimedia.org/wikipedia/commons/thumb/1/19/ProveIt_logo_for_user_boxes.svg/22px-ProveIt_logo_for_user_boxes.svg.png',

	/**
	 * Content language
	 *
	 * @type string
	 */
	contentLanguage: null,

	/**
	 * Interface language
	 *
	 * @type string
	 */
	userLanguage: 'en',

	/**
	 * Convenience function to get a setting
	 *
	 * @param {string} setting key
	 * @return {string} setting value
	 */
	getSetting: function ( key ) {
		return proveit.settings[ proveit.contentLanguage ][ key ];
	},

	/**
	 * Convenience function to get a message
	 *
	 * @param {string} message key
	 * @return {string} message value
	 */
	getMessage: function ( key ) {
		return mw.message( 'proveit-' + key ).text();
	},

	/**
	 * Convenience function to get the edit textbox
	 *
	 * @return {jQuery} Edit textbox
	 */
	getTextbox: function () {
		return $( '#wpTextbox1' );
	},

	/**
	 * Initialize ProveIt
	 *
	 * @return {void}
	 */
	init: function () {

		// Initialize only when editing
		var action = mw.config.get( 'wgAction' );
		if ( action !== 'edit' && action !== 'submit' ) {
			return;
		}

		// Set the content language
		proveit.contentLanguage = mw.config.get( 'wgContentLanguage' );
		if ( ! ( proveit.contentLanguage in proveit.settings ) ) {
			return; // Language not supported
		}

		// Set the interface language
		var userLanguage = mw.config.get( 'wgUserLanguage' );
		if ( userLanguage in proveit.messages ) {
			proveit.userLanguage = userLanguage;
		}
		mw.messages.set( proveit.messages[ userLanguage ] );

		// Get the templates data
		var api = new mw.Api();
		api.get({
			'action': 'templatedata',
			'generator': 'categorymembers',
			'gcmtitle': proveit.getSetting( 'category' ),
			'format': 'json'
		}).done( function ( data ) {
			//console.log( data );
			proveit.templates = {};
			for ( var page in data.pages ) {
				page = data.pages[ page ];
				proveit.templates[ page.title ] = page.params; // Replace the templates with the template data
			}
			//console.log( proveit.templates );
			proveit.scanForReferences();
		});

		var dependencies = [
			'jquery.textSelection',
			'jquery.effects.highlight'
		];
		mw.loader.using( dependencies, function () {

			// Replace the references button for the ProveIt button
			proveit.getTextbox().bind( 'wikiEditor-toolbar-buildSection-main', function ( event, section ) {
				delete section.groups.insert.tools.reference;
				section.groups.insert.tools.proveit = {
					label: 'ProveIt',
					type: 'button',
					icon: proveit.ICON,
					action: {
						type: 'callback',
						execute: function () {
							$( '#proveit' ).toggle();
						}
					}
				};
			});

			proveit.makeGUI();

			// Only initialize visible for mainspace, user, and Draft pages
			var namespace = mw.config.get( 'wgCanonicalNamespace' );
			if ( namespace !== '' && namespace !== 'User' && namespace !== 'Draft' ) {
				$( '#proveit' ).hide();
			}
		});
	},

	/**
	 * Generate the interface and insert it into the DOM
	 *
	 * @return {void}
	 */
	makeGUI: function () {

		// First define the elements
		var gui = $( '<div>' ).attr( 'id', 'proveit' );

		// Tabs
		var tabs = $( '<div>').attr( 'id', 'proveit-tabs' ),
			editTab = $( '<span>' ).attr( 'id', 'proveit-edit-tab' ).addClass( 'active' ).text( proveit.getMessage( 'edit-tab' ) ),
			addTab = $( '<span>' ).attr( 'id', 'proveit-add-tab' ).text( proveit.getMessage( 'add-tab' ) ),
			logo = $( '<img>' ).attr({ 'id': 'proveit-logo', 'src': proveit.LOGO, 'alt': 'ProveIt' });

		// Content
		var content = $( '<div>' ).attr( 'id', 'proveit-content' ),
			referenceList = $( '<ul>' ).attr( 'id', 'proveit-reference-list' ),
			referenceFormContainer = $( '<div>' ).attr( 'id', 'proveit-reference-form-container' );

		// Buttons
		var buttons = $( '<div>' ).attr( 'id', 'proveit-buttons' ),
			showAllParamsButton = $( '<button>' ).attr( 'id', 'proveit-show-all-params-button' ).text( proveit.getMessage( 'show-all-params-button' ) ),
			updateButton = $( '<button>' ).attr( 'id', 'proveit-update-button' ).text( proveit.getMessage( 'update-button' ) ),
			insertButton = $( '<button>' ).attr( 'id', 'proveit-insert-button' ).text( proveit.getMessage( 'insert-button' ) );

		// Then put everything together and add it to the DOM
		tabs.append( logo ).append( editTab ).append( addTab );
		buttons.append( showAllParamsButton ).append( updateButton ).append( insertButton );
		content.append( referenceList ).append( referenceFormContainer ).append( buttons );
		gui.append( tabs ).append( content );
		$( document.body ).prepend( gui );

		// Lastly, bind events
		logo.click( function () {
			content.toggle();
		});

		editTab.click( function () {
			$( this ).addClass( 'active' ).siblings().removeClass( 'active' );
			content.show();
			referenceList.show();
			referenceFormContainer.hide();
			buttons.hide();
		});

		addTab.click( function () {
			$( this ).addClass( 'active' ).siblings().removeClass( 'active' );
			content.show();
			referenceList.hide();
			buttons.show();
			showAllParamsButton.show();
			updateButton.hide();
			insertButton.show();

			// Create an empty reference and an empty form out of it
			var firstTemplate = Object.keys( proveit.templates )[0],
				firstTemplate = firstTemplate.substr( firstTemplate.indexOf( ':' ) + 1 ), // Remove the namespace
				emptyReference = new proveit.TemplateReference({ 'template': firstTemplate }),
				emptyForm = emptyReference.toForm();
			referenceFormContainer.html( emptyForm ).show();
		});

		showAllParamsButton.click( function () {
			$( this ).hide();
			$( '#proveit-reference-form label' ).css( 'display', 'block' );
		});

		proveit.getTextbox().change( function () {
			proveit.scanForReferences(); // Always keep the reference list up to date
		});
	},

	/**
	 * Scan for references in the textbox, make a list item for each and fill the reference list with them
	 *
	 * @return {boolean} Whether the scan succeeded and found at least one reference
	 */
	scanForReferences: function () {

		// First empty the previous list
		$( '#proveit-reference-list' ).children().remove();

		// Second, look for all the citations and store them in an array for later
		var text = proveit.getTextbox().val(),
			citations = [],
			citationsRegExp = /<\s*ref\s+name\s*=\s*["|']?\s*([^"'\s]+)\s*["|']?\s*\/\s*>/gi, // Three possibilities: <ref name="foo" />, <ref name='foo' /> and <ref name=foo />
			match,
			citation;

		while ( ( match = citationsRegExp.exec( text ) ) ) {
			citation = new proveit.Citation({ 'name': match[1], 'index': match.index, 'string': match[0] });
			citations.push( citation );
		}

		// Third, look for all the raw and template references
		var matches = text.match( /<\s*ref.*?<\s*\/\s*ref\s*>/gi );

		if ( !matches ) {
			var noReferencesMessage = $( '<div>' ).attr( 'id', 'proveit-no-references-message' ).text( proveit.getMessage( 'no-references' ) );
			$( '#proveit-reference-list' ).append( noReferencesMessage );
			return false;
		}

		var i, j, reference, referenceItem;
		for ( i = 0; i < matches.length; i++ ) {
			// Turn all the matches into reference objects
			reference = proveit.makeReference( matches[ i ] );

			// For each reference, check the citations array for citations to it
			for ( j = 0; j < citations.length; j++ ) {
				citation = citations[ j ];
				if ( reference.name === citation.name ) {
					reference.citations.push( citation );
				}
			}

			// Finally, turn all the references into list items and insert them into the reference list
			referenceItem = reference.toListItem();
			$( '#proveit-reference-list' ).append( referenceItem );
		}
		return true;
	},

	/**
	 * Take a reference string and return a reference object
	 *
	 * @param {string} Wikitext that generates the reference
	 * @return {Citation} Reference object
	 */
	makeReference: function ( referenceString ) {

		// First we need to determine what kind of reference we're dealing with
		// So we get all the template names and search for a match
		var registeredTemplatesArray = [],
			registeredTemplate;
		for ( registeredTemplate in proveit.templates ) {
			registeredTemplate = registeredTemplate.substr( registeredTemplate.indexOf( ':' ) + 1 ), // Remove the namespace
			registeredTemplatesArray.push( registeredTemplate );
		}
		var registeredTemplatesDisjunction = registeredTemplatesArray.join( '|' ),
			regExp = new RegExp( '{{(' + registeredTemplatesDisjunction + ').*}}', 'i' ),
			match = referenceString.match( regExp ),
			reference;

		if ( match ) {
			reference = new proveit.TemplateReference({ 'string': referenceString });

			// Extract the full template string
			var templateString = match[0];

			// Extract the name of the template
			var template = match[1],
				template = template.charAt(0).toUpperCase() + template.slice(1); // Capitalize the first letter

			// Normalize it
			for ( registeredTemplate in proveit.templates ) {
				registeredTemplate
				if ( template.toLowerCase() === registeredTemplate.toLowerCase() ) {
					template = registeredTemplate;
				}
			}
			reference.template = template;

			// Next, extract the parameters
			var paramsString = templateString.substring( templateString.indexOf( '|' ) + 1, templateString.length - 2 ), // From after the first pipe to before the closing "}}"
				paramsArray = paramsString.split( '|' ),
				paramString, paramNameAndValue, paramName, paramValue;

			for ( paramString in paramsArray ) {

				paramNameAndValue = paramsArray[ paramString ].split( '=' );
				paramName = $.trim( paramNameAndValue[0] );
				paramValue = $.trim( paramNameAndValue[1] );

				if ( !paramName || !paramValue ) {
					continue;
				}

				reference.params[ paramName ] = paramValue;
			}
		} else {
			reference = new proveit.RawReference({ 'string': referenceString });
		}

		// Now set the starting index of the reference
		var text = proveit.getTextbox().val();
		reference.index = text.indexOf( referenceString );

		// Lastly, extract the name of the reference, if any
		// Three possibilities: <ref name="foo">, <ref name='foo'> and <ref name=foo>
		regExp = /<[\s]*ref[\s]*name[\s]*=[\s]*(?:(?:\"(.*?)\")|(?:\'(.*?)\')|(?:(.*?)))[\s]*>/i;
		match = referenceString.match( regExp );
		if ( match ) {
			reference.name = match[1] || match[2] || match[3];
		}

		return reference;
	},

	/**
	 * Add the ProveIt revision tag to the edit
	 *
	 * @return {void}
	 */
	addTag: function () {
		if ( $( '#wpChangeTags' ).length > 0 ) {
			return;
		}
		var tagInput = $( '<input>' ).attr({
			'id': 'wpChangeTags',
			'type': 'hidden',
			'name': 'wpChangeTags',
			'value': proveit.getSetting( 'tag' )
		});
		$( '#editform' ).append( tagInput );
	},

	/**
	 * Class for citations: <ref name="some-reference" />
	 *
	 * The citation class is the base class. It has the properties and methods common to all references.
	 *
	 * @param {object} argObj Data for constructing the object
	 */
	Citation: function ( argObj ) {

		/**
		 * Name of the class
		 */
		this.type = 'Citation';

		/**
		 * Name of the reference
		 *
		 * This is the value of the "name" parameter of the <ref> tag: <ref name="abc" />
		 */
		this.name = argObj.name;

		/**
		 * Location of this reference in the edit textbox
		 */
		this.index = argObj.index;

		/**
		 * Wikitext for this reference.
		 */
		this.string = argObj.string;

		/**
		 * Highlight the string in the textbox and scroll it to view
		 *
		 * @return {void}
		 */
		this.highlight = function () {
			var textbox = proveit.getTextbox()[0];
			var text = textbox.value;

			// Scroll to the string
			textbox.value = text.substring( 0, this.index );
			textbox.focus();
			textbox.scrollTop = 99999999; // Larger than any real textarea (hopefully)
			var currentScrollTop = textbox.scrollTop;
			textbox.value += text.substring( this.index );
			if ( currentScrollTop > 0 ) {
				textbox.scrollTop = currentScrollTop + 300;
			}

			// Highlight the string
			var start = this.index;
			var end = this.index + this.string.length;
			$( textbox ).focus().textSelection( 'setSelection', { 'start': start, 'end': end } );
		};
	},

	/**
	 * Class for raw references: <ref>This is a raw reference, it uses no templates.</ref>
	 *
	 * @extends Citation
	 * @param {object} argObj Data for constructing the object
	 */
	RawReference: function ( argObj ) {

		/**
		 * Extend the Citation class
		 */
		proveit.Citation.call( this, argObj );

		/**
		 * Name of the class
		 *
		 * Overrides the value inherited from the Citation class.
		 */
		this.type = 'RawReference';

		/**
		 * Array of citations for this reference.
		 */
		this.citations = [];

		/**
		 * Convert this reference to wikitext
		 *
		 * This method is trivial, but it needs to exist because it isn't trivial in the TemplateReference class,
		 * and sometimes we call it on a reference object without knowing if it's a raw reference or a template reference.
		 *
		 * @return {string} wikitext for this reference
		 */
		this.toString = function () {
			return this.string;
		};

		/**
		 * Convert this reference to a list item ready to be inserted into the reference list
		 *
		 * @return {jQuery} jQuery-wrapped <li>
		 */
		this.toListItem = function () {

			var item = $( '<li>' ).attr( 'class', 'proveit-reference-item' ).text( this.string ),
				citations = $( '<span>' ).attr( 'class', 'proveit-citations' );

			for ( var i = 0; i < this.citations.length; i++ ) {
				citations.append( $( '<a>' ).attr({ 'href': '#', 'class': 'proveit-citation' }).text( i + 1 ) );
			}

			item.append( citations );

			// Bind events
			var reference = this;
			item.click( function ( event ) {
				event.stopPropagation();
				reference.highlight();
				return false;
			});

			item.find( 'a.proveit-citation' ).click( function ( event ) {
				event.stopPropagation();
				var i = parseInt( $( this ).text(), 10 ) - 1;
				var citation = reference.citations[ i ];
				citation.highlight();
				return false;
			});

			return item;
		};
	},

	/**
	 * Class for template references: <ref>{{Cite book |first=Charles |last=Darwin |title=The Origin of Species}}</ref>
	 *
	 * @extends RawReference
	 * @param {object} argObj Data for constructing the object
	 */
	TemplateReference: function ( argObj ) {

		/**
		 * Extend the RawReference class
		 */
		proveit.RawReference.call( this, argObj );

		/**
		 * Name of the class
		 *
		 * Overrides the value inherited from the RawReference class.
		 */
		this.type = 'TemplateReference';

		/**
		 * Name of the template used by this reference.
		 */
		this.template = argObj.template;

		/**
		 * Object mapping the parameter names of this reference to their values
		 *
		 * This object is constructed directly out of the wikitext, so it doesn't include
		 * any information about the parameters other than their names and values,
		 */
		this.params = {};

		/**
		 * Get the registered parameters for this reference
		 *
		 * @return {object}
		 */
		this.getRegisteredParams = function () {
			var formattedNamespaces = mw.config.get( 'wgFormattedNamespaces' );
				templateNamespace = formattedNamespaces[10];
			return proveit.templates[ templateNamespace + ':' + this.template ];
		};

		/**
		 * Get the required parameters for this reference
		 *
		 * @return {object}
		 */
		this.getRequiredParams = function () {
			var requiredParams = {},
				registeredParams = this.getRegisteredParams();
			for ( var registeredParam in registeredParams ) {
				if ( registeredParams[ registeredParam ].required ) {
					requiredParams[ registeredParam ] = registeredParams[ registeredParam ];
				}
			}
			return requiredParams;
		};

		/**
		 * Get the suggested parameters for this reference
		 *
		 * @return {object}
		 */
		this.getSuggestedParams = function () {
			var suggestedParams = {},
				registeredParams = this.getRegisteredParams();
			for ( var registeredParam in registeredParams ) {
				if ( registeredParams[ registeredParam ].suggested ) {
					suggestedParams[ registeredParam ] = suggestedParams[ registeredParam ];
				}
			}
			return suggestedParams;
		};

		/**
		 * Get the optional parameters for this reference
		 *
		 * @return {object}
		 */
		this.getOptionalParams = function () {
			var optionalParams = {},
				registeredParams = this.getRegisteredParams();
			for ( var registeredParam in registeredParams ) {
				if ( !registeredParams[ registeredParam ].required && !registeredParams[ registeredParam ].suggested ) {
					optionalParams[ registeredParam ] = registeredParams[ registeredParam ];
				}
			}
			return optionalParams;
		};

		/**
		 * Convert this reference to wikitext
		 *
		 * Overrides the toString() method of the RawReference class.
		 *
		 * @return {string} Wikitext for this reference
		 */
		this.toString = function () {
			var string;

			if ( this.name ) {
				string = '<ref name="' + this.name + '">';
			} else {
				string = '<ref>';
			}

			string += '{{' + this.template;

			for ( var name in this.params ) {
				string += ' |' + name + '=' + this.params[ name ];
			}

			string += '}}</ref>';

			return string;
		};

		/**
		 * Convert this reference to a list item ready to be inserted into the reference list
		 *
		 * Overrides the toListItem() method of the RawReference class.
		 *
		 * @return {jQuery} jQuery-wrapped node for reference list
		 */
		this.toListItem = function () {

			var item = $( '<li>' ).attr( 'class', 'proveit-reference-item' );

			item.append( $( '<span>' ).attr( 'class', 'proveit-template' ).text( this.template ) );
			var requiredParams = this.getRequiredParams(),
				requiredParam,
				label,
				value;
			for ( requiredParam in requiredParams ) {
				label = requiredParams[ requiredParam ].label[ proveit.userLanguage ];
				value = this.params[ requiredParam ];
				item.append( $( '<span>' ).attr( 'class', 'proveit-label' ).text( label ) );
				item.append( ': ', $( '<span>' ).attr( 'class', 'proveit-value' ).text( value ) );
			}

			var citations = $( '<span>' ).attr( 'class', 'proveit-citations' );

			var i;
			for ( i = 0; i < this.citations.length; i++ ) {
				citations.append( $( '<a>' ).attr({ 'href': '#', 'class': 'proveit-citation' }).text( i + 1 ) );
			}

			item.append( citations );

			// Bind events
			var reference = this;
			item.click( function () {
				reference.highlight();
				var form = reference.toForm();
				$( '#proveit-reference-form-container' ).html( form ).show();
				$( '#proveit-reference-list' ).hide();
				$( '#proveit-buttons' ).show();
				$( '#proveit-show-all-params-button' ).show();
				$( '#proveit-update-button' ).show();
				$( '#proveit-insert-button' ).hide();
			});

			item.find( 'a.proveit-citation' ).click( function ( event ) {
				event.stopPropagation();
				var i = parseInt( $( this ).text(), 10 ) - 1;
				var citation = reference.citations[ i ];
				citation.highlight();
				return false;
			});

			return item;
		};

		/**
		 * Convert this reference into a HTML form filled with its data
		 *
		 * @return {jQuery} jQuery-wrapped <form>
		 */
		this.toForm = function () {

			var form = $( '<form>' ).attr( 'id', 'proveit-reference-form' ), pair;

			// Insert the <ref> name field
			var refNameLabel = $( '<label>' ).text( proveit.getMessage( 'ref-name-label' ) ),
				refNameInput = $( '<input>' ).attr({ 'name': 'ref-name', 'value': this.name });
			refNameLabel.append( refNameInput );
			form.append( refNameLabel );

			// Insert the dropdown menu
			var templateLabel = $( '<label>' ).text( proveit.getMessage( 'template-label' ) ),
				templateSelect = $( '<select>' ).attr( 'name', 'template' ),
				templateName,
				templateOption;

			for ( templateName in proveit.templates ) {
				templateName = templateName.substr( templateName.indexOf( ':' ) + 1 ), // Remove the namespace
				templateOption = $( '<option>' ).text( templateName ).attr( 'value', templateName );
				if ( this.template === templateName ) {
					templateOption.attr( 'selected', 'selected' );
				}
				templateSelect.append( templateOption );
			}
			templateLabel.append( templateSelect );
			form.append( templateLabel );

			// The insert all the other fields
			var paramName, registeredParam, paramLabel, paramType, paramDescription, paramValue, label, paramNameInput, paramValueInput,
				registeredParams = this.getRegisteredParams(),
				optionalParams = this.getOptionalParams();

			for ( paramName in registeredParams ) {

				registeredParam = registeredParams[ paramName ];

				// Defaults
				paramLabel = paramName;
				paramType = 'text';
				paramDescription = '';
				paramValue = '';

				// Override with template data
				if ( registeredParam.label ) {
					paramLabel = registeredParam.label[ proveit.userLanguage ];
				}
				if ( registeredParam.type ) {
					paramType = registeredParam.type;
				}
				if ( registeredParam.description ) {
					paramDescription = registeredParam.description[ proveit.userLanguage ];
				}
				if ( paramName in this.params ) {
					paramValue = this.params[ paramName ];
				}

				label = $( '<label>' ).attr({ 'class': 'proveit-param-pair', 'title': paramDescription }).text( paramLabel );
				paramNameInput = $( '<input>' ).attr({ 'type': 'hidden', 'class': 'proveit-param-name', 'value': paramName });
				paramValueInput = $( '<input>' ).attr({ 'type': paramType, 'class': 'proveit-param-value', 'value': paramValue });

				// Hide the optional parameters, unless they are filled
				if ( ( paramName in optionalParams ) && !paramValue ) {
					label.addClass( 'hidden' );
				}

				label.prepend( paramValueInput ).append( paramNameInput );
				form.append( label );
			}

			// Bind events
			var reference = this;
			templateSelect.change( function ( event ) {
				reference.template = $( event.currentTarget ).val();
				var form = reference.toForm();
				$( '#proveit-reference-form-container' ).html( form );
				$( '#proveit-show-all-params-button' ).show();

			});

			$( '#proveit-update-button' ).unbind( 'click' ).click( function () {
				reference.update();
			});

			$( '#proveit-insert-button' ).unbind( 'click' ).click( function () {
				reference.insert();
			});

			return form;
		};

		/**
		 * Update the data of this reference with the content of the reference form
		 *
		 * @return {void}
		 */
		this.loadFromForm = function () {
			this.name = $( '#proveit-reference-form input[name="ref-name"]' ).val();
			this.template = $( '#proveit-reference-form select[name="template"]' ).val();

			// Load all the parameter key-value pairs
			this.params = {};
			var pairs = $( '#proveit-reference-form .proveit-param-pair' ),
				pair, paramName, paramValue;
			for ( var i = 0; i < pairs.length; i++ ) {
				pair =  pairs[ i ];
				paramName = $( 'input.proveit-param-name', pair ).val();
				paramValue = $( 'input.proveit-param-value', pair ).val();
				if ( paramName !== '' && paramValue !== '' ) {
					this.params[ paramName ] = paramValue;
				}
			}
			this.string = this.toString();
		};

		/**
		 * Update the wikitext in the textbox with the current data of this reference
		 *
		 * @return {void}
		 */
		this.update = function () {
			var oldString = this.string;
			this.loadFromForm();
			var newString = this.string;

			// Replace the old reference
			var textbox = proveit.getTextbox(),
				text = textbox.val().replace( oldString, newString );

			textbox.val( text );

			// Update the index and highlight the reference
			text = textbox.val();
			this.index = text.indexOf( newString );
			this.highlight();

			// Add the tag and rescan
			proveit.addTag();
			proveit.scanForReferences();
		};

		/**
		 * Insert this reference into the textbox
		 *
		 * @return {void}
		 */
		this.insert = function () {
			this.loadFromForm();

			// Replace the existing selection (if any)
			var string = this.string,
				textbox = proveit.getTextbox();

			textbox.textSelection( 'encapsulateSelection', {
				'peri': string,
				'replace': true
			});

			// Update the index and highlight the reference
			this.index = textbox.val().indexOf( this.string );
			this.highlight();

			// Add the tag and rescan
			proveit.addTag();
			proveit.scanForReferences();
		};
	}
};

$( proveit.init );

}( mw, jQuery ) );