export const moduleID = 'pf2e-staves';


export const lg = x => console.log(x);


Hooks.once('init', () => {
    // Add Charge spell type.
    CONFIG.PF2E.spellCategories.charge = 'Charge';
    CONFIG.PF2E.preparationType.charge = 'Charge';
});


// When stave added to a character, also create corresponding spellcasting entry.
Hooks.on('createItem', async (weapon, options, userID) => {
    if (!weapon.actor) return;
    if (userID !== game.user.id) return;

    const traits = weapon.system.traits?.value;
    const isStave = traits.includes('magical') && traits.includes('staff');
    if (!isStave) return;

    const spells = [];
    const description = weapon.system.description.value;
    const slotLevels = ['Cantrips?', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th'];
    for (let i = 0; i < slotLevels.length; i++) {
        const regex = new RegExp(`${slotLevels[i]}.*@UUID.*\n`);
        const match = description.match(regex);
        if (!match) continue;

        const strs = match[0].match(/(@UUID[^}]*})/g);
        for (const str of strs) {
            const UUID = str.split('[')[1].split(']')[0];
            const spell = await fromUuid(UUID);
            if (!spell || spell?.type !== 'spell') continue;
            
            let spellClone;
            if (spell.id) spellClone = spell.clone({ 'system.location.heightenedLevel': i });
            else {
                const { pack, _id } = spell;
                const spellFromPack = await game.packs.get(pack)?.getDocuments().find(s => s.id === _id);
                spellClone = spellFromPack.clone({ 'system.location.heightenedLevel': i });
            }

            spells.push(spellClone);
        }
    }
    
    if (!spells.length) { // fallback
        const UUIDs = description.match(/@UUID[^}]*}/g);
        if (!UUIDs) return;

        for (const str of UUIDs) {
            const UUID = str.split('[')[1].split(']')[0];
            const spell = await fromUuid(UUID);
            if (!spell || spell?.type !== 'spell') continue;
            
            if (spell.id) spells.push(spell);
            else {
                const { pack, _id } = spell;
                const spellFromPack = await game.packs.get(pack)?.getDocuments().find(s => s.id === _id);
                if (spellFromPack) spells.push(spellFromPack);
            }
        }
    }

    if (!spells.length) return;

    const { actor } = weapon;
    const createData = {
        type: 'spellcastingEntry',
        name: weapon.name,
        system: {
            prepared: {
                value: 'charge'
            }
        },
        flags: {
            [moduleID]: {
                staveID: weapon.id,
                charges: getHighestSpellslot(actor)
            }
        }
    }
    const [spellcastingEntry] = await actor.createEmbeddedDocuments('Item', [createData]);
    for (const spell of spells) await spellcastingEntry.addSpell(spell);
});

// Delete spellcastingEntry associated with stave.
Hooks.on('preDeleteItem', (weapon, options, userID) => {
    const traits = weapon.system.traits?.value;
    const isStave = traits.includes('magical') && traits.includes('staff');
    if (!isStave) return;

    const { actor } = weapon;
    const spellcastingEntries = actor.items.filter(i => i.type === 'spellcastingEntry');
    const spellcastingEntry = spellcastingEntries.find(i => i.getFlag(moduleID, 'staveID') === weapon.id);
    if (spellcastingEntry) spellcastingEntry.delete();
});

// Implement charge spellcasting rules on character sheet.
// Hooks.on('renderCharacterSheetPF2e', (sheet, [html], sheetData) => {
Hooks.on('renderCreatureSheetPF2e', (sheet, [html], sheetData) => {
    const actor = sheet.object;
    const isPC = actor.type === 'character';

    const spellcastingLis = html.querySelectorAll('li.spellcasting-entry');
    for (const li of spellcastingLis) {
        const spellcastingEntry = actor.spellcasting.get(li.dataset.containerId);
        if (spellcastingEntry.system.prepared.value !== 'charge') continue;

        let chargeEl;
        if (isPC) {
            chargeEl = document.createElement('section');
            chargeEl.innerHTML = `
                <h4 class='skill-name spellcasting'>Charges</h4>
                <input class="${moduleID}-charges" type="number" value="${spellcastingEntry.getFlag(moduleID, 'charges')}" placeholder="0">
                <a class="${moduleID}-charge"><i class="fas fa-redo"></i></a>
            `;
        } else {
            chargeEl = document.createElement('div');
            chargeEl.classList.add('inline-field');
            chargeEl.innerHTML = `
                <label>Charges</label>
                <input class="dc-input modifier adjustable" type="number" value="${spellcastingEntry.getFlag(moduleID, 'charges')}" placeholder="0">
                <a class="${moduleID}-charge"><i class="fas fa-redo"></i></a>
            `;
        }
        
        // Charge input.
        chargeEl.querySelector('input').addEventListener('focus', ev => {
            ev.currentTarget.select();
        });
        chargeEl.querySelector('input').addEventListener('change', async ev => {
            const { target } = ev;
            const charges = target.value;
            const clampedCharges = Math.max(0, charges);
            target.value = clampedCharges;

            await spellcastingEntry.setFlag(moduleID, 'charges', clampedCharges);
        });

        // Charge stave prompt.
        chargeEl.querySelector('a').addEventListener('click', async ev => {
            let options = ``;
            for (const entry of actor.spellcasting) {
                if (entry.system.prepared.value !== 'prepared') continue;

                const preppedSpells = [];
                for (let i = 1; i < 12; i++) {
                    const currentSlot = Object.values(entry.system.slots)[i];
                    for (const preppedSpell of Object.values(currentSlot.prepared)) {
                        if (!preppedSpell.id || preppedSpell.expended) continue;

                        const spell = actor.items.get(preppedSpell.id);
                        preppedSpells.push({
                            id: spell.id,
                            name: spell.name,
                            slotLevel: i
                        });
                    }
                }
                if (!preppedSpells.length) continue;
                
                options += `<optgroup label="${entry.name}">`
                for (const spell of preppedSpells) {
                    options += `<option value="${spell.id}">${spell.name} (+${spell.slotLevel})</option>`
                }
                options += `</optgroup>`;
            }
            if (options) options = `<option></option>` + options;
            const content = options
                ? `
                    <div style="font-size: var(--font-size-13);">Expend spell slot for extra charges?</div>
                    <select style="width: 100%; margin-bottom: 5px;">
                        ${options}
                    </select>
                `
                : null;
            await Dialog.prompt({
                title: 'Charge Stave?',
                content,
                label: 'Charge',
                callback: async ([dialogHtml]) => {
                    const charges = getHighestSpellslot(sheet.object);
                    const selectedSpellID = dialogHtml.querySelector('select')?.value;
                    const spellLi = html.querySelector(`li[data-item-id="${selectedSpellID}"]`);
                    if (!spellLi) return spellcastingEntry.setFlag(moduleID, 'charges', charges);

                    const { slotLevel, slotId, entryId } = spellLi.dataset;
                    const entry = actor.spellcasting.get(entryId);
                    entry.setSlotExpendedState(slotLevel, slotId, true);
                    
                    return spellcastingEntry.setFlag(moduleID, 'charges', charges + parseInt(slotLevel));
                },
                rejectClose: false,
                options: { width: 250 }
            });
        });

        const characterHeader = li.querySelector('div.statistic-values');
        const npcHeader = li.querySelector('h4.name');
        if (isPC) characterHeader.appendChild(chargeEl);
        else npcHeader.after(chargeEl);

        // Override cast button event handlers to use charges instead of spell slots.
        const castButtons = li.querySelectorAll('button.cast-spell');
        for (const button of castButtons) {
            const spellLi = button.closest('li');
            const slotLevel = parseInt(spellLi.dataset.slotLevel);
            if (!slotLevel) continue;

            button.replaceWith(button.cloneNode(true));
        }
        const replacedButtons = li.querySelectorAll('button.cast-spell');
        for (const button of replacedButtons) {
            const spellLi = button.closest('li');
            const slotLevel = parseInt(spellLi.dataset.slotLevel);
            if (!slotLevel) continue;

            const spell = actor.items.get(button.closest('li').dataset.itemId);
            const charges = spellcastingEntry.getFlag(moduleID, 'charges');
            button.addEventListener('click', async ev => {
                if (slotLevel > charges) return ui.notifications.warn('You do not have enough stave charges to cast this spell.');

                await spellcastingEntry.setFlag(moduleID, 'charges', charges - slotLevel);
                await spellcastingEntry.cast(spell, { consume: false });
            });
            button.addEventListener('contextmenu', async ev => {
                if (!charges) return ui.notifications.warn('You do not have enough stave charges to cast this spell.');
                const select = document.createElement('select');
                select.style.width = '100%';
                select.style['margin-bottom'] = '5px';
                for (const entry of actor.spellcasting) {
                    if (entry.system.prepared.value !== 'spontaneous') continue;
                    select.innerHTML += `<optgroup label="${entry.name}">`;
                    for (let i = slotLevel; i < 12; i++) {
                        const currentSlotLevel = Object.values(entry.system.slots)[i];
                        const { value, max } = currentSlotLevel;
                        if (value) select.innerHTML += `<option value="${entry.id}-${i}">Level ${i} Slot (${value}/${max})</option>`;
                    }

                    select.innerHTML += `</optgroup>`;
                }
                if (!select.length) return ui.notifications.warn('You do not have any Spontaneous spell slots available to cast this spell.');

                await Dialog.prompt({
                    title: 'Use Spell Slot?',
                    content: select.outerHTML,
                    label: 'Consume Spell Slot',
                    callback: async ([html]) => {
                        const select = html.querySelector('select');
                        const [entryID, selectedLevel] = select.value.split('-');
                        const entry = actor.spellcasting.get(entryID);
                        const currentSlots = entry.system.slots[`slot${selectedLevel}`].value;

                        await actor.spellcasting.get(entryID).update({ [`system.slots.slot${selectedLevel}.value`]: currentSlots - 1 });
                        await spellcastingEntry.setFlag(moduleID, 'charges', charges - 1);
                        await spellcastingEntry.cast(spell, { consume: false });
                    },
                    rejectClose: false,
                    options: { width: 250 }
                });
            });
        }
    }
});


function getHighestSpellslot(actor) {
    let charges = 0;
    actor.spellcasting.forEach(entry => {
        if (entry.flags[moduleID]) return;

        let i = 0;
        Object.values(entry.system.slots).forEach(slot => {
            if (slot.max && charges < i) charges = i;
            i++;
        });
    });

    return charges;
}
